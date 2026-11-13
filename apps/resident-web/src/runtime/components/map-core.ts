// What WeChat's map gives a WeChat application, on Leaflet: a base map in GCJ-02 (Amap tiles, labels in
// the resident's language), with an OpenStreetMap-based fallback drawn in WGS-84 when Amap is
// unreachable. Callers always speak GCJ-02, like WeChat; conversion happens here.
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../geo'
import { systemLanguage, systemText } from '../system-text'

export interface Provider { id: 'amap' | 'carto'; crs: 'gcj02' | 'wgs84'; layer: () => L.TileLayer }

export const PROVIDERS: Record<Provider['id'], Provider> = {
  amap: {
    id: 'amap',
    crs: 'gcj02',
    layer: () => L.tileLayer(
      `https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=${systemLanguage() === 'en' ? 'en' : 'zh_cn'}&size=1&scl=1&style=7`,
      { subdomains: '1234', maxNativeZoom: 18, maxZoom: 20, minZoom: 3, attribution: systemText('mapSource'), className: 'wx-map-tiles' }
    )
  },
  carto: {
    id: 'carto',
    crs: 'wgs84',
    layer: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxNativeZoom: 20, maxZoom: 20, minZoom: 3, attribution: systemText('mapSourceOsm'), className: 'wx-map-tiles' })
  }
}

/** One preferred provider for every map on the page, switched once if Amap keeps failing. */
let preferred: Provider = PROVIDERS.amap
const listeners = new Set<(provider: Provider) => void>()

export function currentProvider(): Provider {
  return preferred
}

export function onProviderChange(listener: (provider: Provider) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Adds the base layer and falls back to the other tiles if most of the first screen fails. */
export function attachBaseLayer(map: L.Map, provider: Provider): L.TileLayer {
  const layer = provider.layer().addTo(map)
  if (provider.id === 'amap') {
    let loaded = 0
    let failed = 0
    layer.on('tileload', () => { loaded++ })
    layer.on('tileerror', () => {
      failed++
      if (failed >= 6 && loaded === 0 && preferred.id === 'amap') {
        preferred = PROVIDERS.carto
        listeners.forEach(listener => listener(preferred))
      }
    })
  }
  return layer
}

export function toDisplay(provider: Provider, latitude: number, longitude: number): L.LatLng {
  if (provider.crs === 'gcj02') return L.latLng(latitude, longitude)
  const [lat, lng] = gcj02ToWgs84(latitude, longitude)
  return L.latLng(lat, lng)
}

export function fromDisplay(provider: Provider, point: L.LatLng): { latitude: number; longitude: number } {
  if (provider.crs === 'gcj02') return { latitude: point.lat, longitude: point.lng }
  const [latitude, longitude] = wgs84ToGcj02(point.lat, point.lng)
  return { latitude, longitude }
}

/** "#RRGGBBAA" (WeChat) -> rgb + opacity for SVG. */
export function parseColor(color: string | undefined, fallback = '#000000'): { color: string; opacity: number } {
  const value = (color || fallback).trim()
  const long = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(value)
  if (long) return { color: `#${long[1]}`, opacity: parseInt(long[2], 16) / 255 }
  return { color: value, opacity: 1 }
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
}
