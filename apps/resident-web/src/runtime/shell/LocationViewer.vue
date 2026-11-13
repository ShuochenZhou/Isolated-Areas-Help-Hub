<script setup lang="ts">
// wx.openLocation: WeChat's own location page — the place on a map, its name and address, and
// a way to navigate there with a maps app (on the web: Amap, Apple Maps or Google Maps).
import L from 'leaflet'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { gcj02ToWgs84 } from '../geo'
import { systemText } from '../system-text'
import type { LocationState } from '../ui'
import { attachBaseLayer, currentProvider, toDisplay } from '../components/map-core'

const props = defineProps<{ state: LocationState }>()
const container = ref<HTMLElement | null>(null)
const closing = ref(false)
let map: L.Map | null = null

const PIN = 'data:image/svg+xml;charset=utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52"><path d="M20 51C20 51 37 31.5 37 19A17 17 0 0 0 3 19C3 31.5 20 51 20 51Z" fill="#c65c3f" stroke="#fff" stroke-width="2"/><circle cx="20" cy="19" r="6.5" fill="#fff"/></svg>')

onMounted(() => {
  const provider = currentProvider()
  const position = toDisplay(provider, props.state.latitude, props.state.longitude)
  map = L.map(container.value!, { center: position, zoom: Math.min(18, Math.max(5, props.state.scale || 16)), zoomControl: false, attributionControl: true })
  map.attributionControl.setPrefix(false)
  attachBaseLayer(map, provider)
  L.marker(position, { icon: L.icon({ iconUrl: PIN, iconSize: [36, 47], iconAnchor: [18, 46] }), keyboard: false }).addTo(map)
})
onBeforeUnmount(() => { map?.remove(); map = null })

function close() {
  if (closing.value) return
  closing.value = true
  setTimeout(() => props.state.close(), 200)
}

const name = props.state.name || props.state.address || `${props.state.latitude.toFixed(5)}, ${props.state.longitude.toFixed(5)}`
const [wgsLat, wgsLng] = gcj02ToWgs84(props.state.latitude, props.state.longitude)
const links = [
  { label: systemText('amap'), href: `https://uri.amap.com/marker?position=${props.state.longitude},${props.state.latitude}&name=${encodeURIComponent(name)}&coordinate=gaode&callnative=1` },
  { label: systemText('appleMaps'), href: `https://maps.apple.com/?ll=${wgsLat},${wgsLng}&q=${encodeURIComponent(name)}` },
  { label: systemText('googleMaps'), href: `https://www.google.com/maps/search/?api=1&query=${wgsLat},${wgsLng}` }
]
</script>

<template>
  <div class="wx-location" :class="{ 'wx-closing': closing }" role="dialog" aria-modal="true">
    <div ref="container" class="wx-location-map" />
    <button type="button" class="wx-location-close" :aria-label="systemText('close')" @click="close">
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 4.5L7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div class="wx-location-card">
      <div class="wx-location-name">{{ name }}</div>
      <div v-if="state.address && state.address !== name" class="wx-location-address">{{ state.address }}</div>
      <div class="wx-location-label">{{ systemText('navigateWith') }}</div>
      <div class="wx-location-links">
        <a v-for="link in links" :key="link.label" :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
      </div>
    </div>
  </div>
</template>
