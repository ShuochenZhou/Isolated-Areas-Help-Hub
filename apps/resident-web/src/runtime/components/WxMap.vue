<script setup lang="ts">
// <map>: WeChat's map component on Leaflet. Same properties (latitude/longitude/scale, markers
// with icons, anchors and callouts, polylines with dotted/arrow styles, circles, include-points)
// and events (markertap, callouttap, regionchange with begin/end and causedBy, tap), and a
// MapContext for wx.createMapContext. Coordinates are GCJ-02 as in WeChat.
import L from 'leaflet'
import { inject, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { assets } from 'virtual:miniapp'
import type { MapApi, PageRecord } from '../page'
import type { ComponentEvent } from '../types'
import { attachBaseLayer, currentProvider, escapeHtml, fromDisplay, onProviderChange, parseColor, toDisplay, type Provider } from './map-core'

interface Point { latitude: number; longitude: number }
interface Callout { content?: string; display?: string; color?: string; fontSize?: number; borderRadius?: number; bgColor?: string; padding?: number; textAlign?: string }
interface Marker {
  id?: number; latitude: number; longitude: number; iconPath?: string; width?: number | string; height?: number | string
  anchor?: { x: number; y: number }; title?: string; alpha?: number; zIndex?: number; rotate?: number; callout?: Callout
}
interface Polyline { points: Point[]; color?: string; width?: number; dottedLine?: boolean; arrowLine?: boolean; borderColor?: string; borderWidth?: number }
interface Circle { latitude: number; longitude: number; radius: number; color?: string; fillColor?: string; strokeWidth?: number }

const props = defineProps({
  latitude: { type: Number, default: 39.92 },
  longitude: { type: Number, default: 116.46 },
  scale: { type: [Number, String], default: 16 },
  minScale: { type: Number, default: 3 },
  maxScale: { type: Number, default: 20 },
  markers: { type: Array as () => Marker[], default: () => [] },
  polyline: { type: Array as () => Polyline[], default: () => [] },
  circles: { type: Array as () => Circle[], default: () => [] },
  includePoints: { type: Array as () => Point[], default: () => [] },
  enableZoom: { type: Boolean, default: true },
  enableScroll: { type: Boolean, default: true },
  enableRotate: { type: Boolean, default: false },
  showLocation: { type: Boolean, default: false }
})
const emit = defineEmits<{
  markertap: [event: ComponentEvent]; callouttap: [event: ComponentEvent]; regionchange: [event: ComponentEvent]
  tap: [event: ComponentEvent]; updated: [event: ComponentEvent]
}>()
const attrs = useAttrs()
const record = inject<PageRecord | null>('wx-page-record', null)
const container = ref<HTMLElement | null>(null)

const DEFAULT_PIN = 'data:image/svg+xml;charset=utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52"><path d="M20 51C20 51 37 31.5 37 19A17 17 0 0 0 3 19C3 31.5 20 51 20 51Z" fill="#f04b4b" stroke="#fff" stroke-width="2"/><circle cx="20" cy="19" r="6.5" fill="#fff"/></svg>')

let map: L.Map | null = null
let provider: Provider = currentProvider()
let base: L.TileLayer | null = null
const lines = L.layerGroup()
const arrows = L.layerGroup()
const circles = L.layerGroup()
const markerLayers = new Map<string, { marker: L.Marker; data: Marker; signature: string; open: boolean }>()
let programmatic = false
let programmaticTimer: ReturnType<typeof setTimeout> | undefined
let lastInclude = ''
let stopProvider: (() => void) | undefined
let resizer: ResizeObserver | undefined

// WXML passes scale="12" as a string, a bound {{12}} as a number.
const zoomOf = (scale: number | string) => Math.min(Math.max(Number(scale) || 16, props.minScale, 3), Math.min(props.maxScale, 20))
const at = (latitude: number, longitude: number) => toDisplay(provider, Number(latitude), Number(longitude))

function byProgram(run: () => void) {
  programmatic = true
  clearTimeout(programmaticTimer)
  run()
  programmaticTimer = setTimeout(() => { programmatic = false }, 450)
}

function center(): Point {
  const point = fromDisplay(provider, map!.getCenter())
  return { latitude: Number(point.latitude.toFixed(6)), longitude: Number(point.longitude.toFixed(6)) }
}

function region() {
  const bounds = map!.getBounds()
  return { southwest: fromDisplay(provider, bounds.getSouthWest()), northeast: fromDisplay(provider, bounds.getNorthEast()) }
}

function regionEvent(type: 'begin' | 'end') {
  const causedBy = programmatic ? 'update' : 'gesture'
  emit('regionchange', {
    type,
    detail: { type, causedBy, rotate: 0, skew: 0, scale: map!.getZoom(), centerLocation: center(), region: region() },
    extra: { causedBy }
  })
}

// ---- markers ---------------------------------------------------------------------------------

function markerKey(marker: Marker, index: number) {
  return marker.id !== undefined && marker.id !== null ? `id:${marker.id}` : `index:${index}`
}

function iconFor(marker: Marker) {
  const width = Number(marker.width) || 32
  const height = Number(marker.height) || (marker.width ? width : 42)
  const anchor = marker.anchor || { x: 0.5, y: 1 }
  const url = (marker.iconPath && (assets[marker.iconPath] || assets[`/${marker.iconPath.replace(/^\.?\//, '')}`] || marker.iconPath)) || DEFAULT_PIN
  return L.icon({
    iconUrl: url,
    iconSize: [width, height],
    iconAnchor: [width * anchor.x, height * anchor.y],
    tooltipAnchor: [width * (0.5 - anchor.x), -height * anchor.y - 4],
    className: 'wx-map-marker'
  })
}

function calloutHtml(callout: Callout) {
  const background = parseColor(callout.bgColor, '#ffffff')
  const style = [
    `color:${parseColor(callout.color, '#000000').color}`,
    `font-size:${Number(callout.fontSize) || 12}px`,
    `border-radius:${Number(callout.borderRadius) || 0}px`,
    `padding:${Number(callout.padding) || 0}px`,
    `text-align:${callout.textAlign || 'center'}`,
    `--wx-callout-bg:${background.color}`
  ].join(';')
  return `<div class="wx-callout-bubble" style="${style}">${escapeHtml(String(callout.content ?? ''))}</div>`
}

function setCallout(entry: { marker: L.Marker; data: Marker; open: boolean }) {
  const callout = entry.data.callout
  entry.marker.unbindTooltip()
  if (!callout || !callout.content) return
  entry.marker.bindTooltip(calloutHtml(callout), { permanent: true, direction: 'top', className: 'wx-map-callout', interactive: true, opacity: 1 })
  const always = callout.display === 'ALWAYS'
  if (always || entry.open) entry.marker.openTooltip()
  else entry.marker.closeTooltip()
  const tooltip = entry.marker.getTooltip()
  tooltip?.on('add', () => {
    const element = tooltip.getElement()
    if (element && !element.dataset.wxBound) {
      element.dataset.wxBound = '1'
      element.addEventListener('click', event => {
        event.stopPropagation()
        emit('callouttap', { type: 'callouttap', detail: { markerId: entry.data.id }, native: event })
      })
    }
  })
  if (tooltip?.isOpen()) tooltip.fire('add')
}

function renderMarkers() {
  if (!map) return
  const seen = new Set<string>()
  ;(props.markers || []).forEach((data, index) => {
    if (!data || !Number.isFinite(Number(data.latitude)) || !Number.isFinite(Number(data.longitude))) return
    const key = markerKey(data, index)
    seen.add(key)
    const signature = JSON.stringify([data.iconPath, data.width, data.height, data.anchor, data.callout, data.alpha, data.zIndex])
    const position = at(data.latitude, data.longitude)
    let entry = markerLayers.get(key)
    if (!entry) {
      const marker = L.marker(position, { icon: iconFor(data), title: data.title || '', opacity: data.alpha ?? 1, zIndexOffset: (data.zIndex || 0) * 100, riseOnHover: false, keyboard: false })
      entry = { marker, data, signature, open: false }
      const current = entry
      marker.on('click', event => {
        L.DomEvent.stopPropagation(event)
        if (current.data.callout && current.data.callout.display !== 'ALWAYS') {
          for (const other of markerLayers.values()) {
            if (other !== current && other.open) { other.open = false; other.marker.closeTooltip() }
          }
          current.open = true
          current.marker.openTooltip()
        }
        emit('markertap', { type: 'markertap', detail: { markerId: current.data.id }, native: event.originalEvent })
      })
      marker.addTo(map!)
      markerLayers.set(key, entry)
      setCallout(entry)
      return
    }
    entry.data = data
    if (!entry.marker.getLatLng().equals(position)) entry.marker.setLatLng(position)
    if (entry.signature !== signature) {
      entry.signature = signature
      entry.marker.setIcon(iconFor(data))
      entry.marker.setOpacity(data.alpha ?? 1)
      entry.marker.setZIndexOffset((data.zIndex || 0) * 100)
      setCallout(entry)
    }
  })
  for (const [key, entry] of markerLayers) {
    if (!seen.has(key)) { entry.marker.remove(); markerLayers.delete(key) }
  }
}

// ---- lines, arrows, circles --------------------------------------------------------------------

function renderLines() {
  if (!map) return
  lines.clearLayers()
  for (const line of props.polyline || []) {
    const points = (line.points || []).filter(point => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
      .map(point => at(point.latitude, point.longitude))
    if (points.length < 2) continue
    const width = Number(line.width) || 2
    const { color, opacity } = parseColor(line.color, '#000000')
    if (line.borderWidth && line.borderColor) {
      const border = parseColor(line.borderColor)
      L.polyline(points, { color: border.color, opacity: border.opacity, weight: width + 2 * Number(line.borderWidth), interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(lines)
    }
    L.polyline(points, {
      color, opacity, weight: width, interactive: false, lineCap: 'round', lineJoin: 'round',
      dashArray: line.dottedLine ? `0.1 ${Math.max(6, width * 2.2)}` : undefined
    }).addTo(lines)
  }
  renderArrows()
}

const ARROW_SPACING = 64

function renderArrows() {
  if (!map) return
  arrows.clearLayers()
  for (const line of props.polyline || []) {
    if (!line.arrowLine) continue
    const points = (line.points || []).map(point => map!.latLngToLayerPoint(at(point.latitude, point.longitude)))
    const size = Math.max(8, (Number(line.width) || 2) + 3)
    let carry = ARROW_SPACING / 2
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]
      const to = points[i]
      const length = from.distanceTo(to)
      const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI
      let offset = carry
      while (offset < length) {
        const ratio = offset / length
        const position = map!.layerPointToLatLng(L.point(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio))
        const html = `<svg width="${size}" height="${size}" viewBox="0 0 10 10" style="transform:rotate(${angle}deg)"><path d="M3 2l4 3-4 3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        L.marker(position, { icon: L.divIcon({ html, className: 'wx-map-arrow', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), interactive: false, keyboard: false }).addTo(arrows)
        offset += ARROW_SPACING
      }
      carry = offset - length
    }
  }
}

function renderCircles() {
  if (!map) return
  circles.clearLayers()
  for (const circle of props.circles || []) {
    const stroke = parseColor(circle.color, '#000000')
    const fill = parseColor(circle.fillColor, '#00000000')
    L.circle(at(circle.latitude, circle.longitude), {
      radius: Number(circle.radius) || 0, color: stroke.color, opacity: stroke.opacity, weight: Number(circle.strokeWidth) || 1,
      fillColor: fill.color, fillOpacity: fill.opacity, interactive: false
    }).addTo(circles)
  }
}

// A fit asked for while the map's box has no size yet (its page still hidden or being laid out):
// Leaflet would zoom all the way in around nothing, so it waits for the box to get a size.
let pendingFit: { points: Point[]; padding?: number[] } | null = null

function fitPoints(points: Point[], padding?: number[]) {
  if (!map) return
  const valid = (points || []).filter(point => point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
  if (!valid.length) return
  const box = container.value
  if (!box || box.clientWidth < 2 || box.clientHeight < 2) {
    pendingFit = { points: valid, padding }
    return
  }
  pendingFit = null
  byProgram(() => {
    if (valid.length === 1) map!.setView(at(valid[0].latitude, valid[0].longitude), map!.getZoom())
    else {
      const [top = 36, right = top, bottom = top, left = right] = padding || []
      // Raster tiles at a fractional zoom are drawn enlarged and blurred, so fitting snaps down
      // to a whole zoom level (a pinch can still stop anywhere).
      const snap = map!.options.zoomSnap
      map!.options.zoomSnap = 1
      // Leaflet measures the box once and caches it; a map created while its page was still hidden
      // keeps a 0×0 size, and fitting into that zooms all the way in. Measure again first.
      map!.invalidateSize({ pan: false })
      try {
        map!.fitBounds(L.latLngBounds(valid.map(point => at(point.latitude, point.longitude))), {
          paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], maxZoom: 17
        })
      } finally { map!.options.zoomSnap = snap }
    }
  })
}

function applyInclude() {
  const key = JSON.stringify((props.includePoints || []).map(point => [point?.latitude, point?.longitude]))
  if (key === lastInclude) return
  lastInclude = key
  if ((props.includePoints || []).length) fitPoints(props.includePoints)
}

// ---- base layer --------------------------------------------------------------------------------

function useProvider(next: Provider) {
  if (!map) return
  const keep = center()
  provider = next
  base?.remove()
  base = attachBaseLayer(map, provider)
  for (const entry of markerLayers.values()) entry.marker.remove()
  markerLayers.clear()
  byProgram(() => map!.setView(at(keep.latitude, keep.longitude), map!.getZoom(), { animate: false }))
  renderMarkers()
  renderLines()
  renderCircles()
}

// ---- lifecycle ---------------------------------------------------------------------------------

const api: MapApi = {
  getCenterLocation: () => center(),
  moveToLocation: (latitude, longitude) => byProgram(() => map?.setView(at(latitude, longitude), map.getZoom())),
  getScale: () => map?.getZoom() ?? zoomOf(props.scale),
  getRegion: () => region(),
  includePoints: (points, padding) => fitPoints(points, padding)
}

onMounted(() => {
  const element = container.value!
  map = L.map(element, {
    center: at(props.latitude, props.longitude),
    zoom: zoomOf(props.scale),
    minZoom: Math.max(3, props.minScale),
    maxZoom: Math.min(20, props.maxScale),
    zoomControl: false,
    attributionControl: true,
    dragging: props.enableScroll,
    scrollWheelZoom: props.enableZoom,
    touchZoom: props.enableZoom,
    doubleClickZoom: props.enableZoom,
    boxZoom: false,
    keyboard: false,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 90
  })
  map.attributionControl.setPrefix(false)
  base = attachBaseLayer(map, provider)
  lines.addTo(map)
  circles.addTo(map)
  arrows.addTo(map)
  map.on('movestart', () => regionEvent('begin'))
  map.on('moveend', () => regionEvent('end'))
  map.on('zoomend', renderArrows)
  map.on('click', event => {
    for (const entry of markerLayers.values()) {
      if (entry.open) { entry.open = false; entry.marker.closeTooltip() }
    }
    const point = fromDisplay(provider, event.latlng)
    emit('tap', { type: 'tap', detail: { latitude: point.latitude, longitude: point.longitude }, native: event.originalEvent })
  })
  renderMarkers()
  renderLines()
  renderCircles()
  applyInclude()
  // WeChat's map keeps its centre when its box changes size (a list appearing above it, the page
  // finishing its layout); Leaflet keeps the top-left corner instead. Either way the move is not
  // the resident's drag, so it must not reach the page as causedBy 'gesture'.
  resizer = new ResizeObserver(() => {
    if (!map) return
    const centre = map.getCenter()
    byProgram(() => {
      map!.invalidateSize({ pan: false })
      map!.setView(centre, map!.getZoom(), { animate: false })
    })
    if (pendingFit) fitPoints(pendingFit.points, pendingFit.padding)
  })
  resizer.observe(element)
  stopProvider = onProviderChange(useProvider)
  if (provider.id !== currentProvider().id) useProvider(currentProvider())
  const id = attrs.id
  if (record && id) record.maps.set(String(id), api)
  emit('updated', { type: 'updated', detail: {} })
})

onBeforeUnmount(() => {
  const id = attrs.id
  if (record && id && record.maps.get(String(id)) === api) record.maps.delete(String(id))
  resizer?.disconnect()
  stopProvider?.()
  clearTimeout(programmaticTimer)
  map?.remove()
  map = null
})

watch(() => [props.latitude, props.longitude] as const, ([latitude, longitude]) => {
  if (map && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    byProgram(() => map!.setView(at(latitude, longitude), map!.getZoom()))
  }
})
watch(() => props.scale, scale => { if (map) byProgram(() => map!.setZoom(zoomOf(scale))) })
watch(() => props.markers, renderMarkers)
watch(() => props.polyline, renderLines)
watch(() => props.circles, renderCircles)
watch(() => props.includePoints, applyInclude)
</script>

<template>
  <wx-map>
    <div ref="container" class="wx-map-container" />
    <div class="wx-map-slot"><slot /></div>
  </wx-map>
</template>
