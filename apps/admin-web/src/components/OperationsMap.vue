<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DemandCluster, SupplyRequest } from '@/api/types'

const props = defineProps<{ clusters: DemandCluster[]; requests: SupplyRequest[] }>()
const mapElement = ref<HTMLDivElement>()
const mapError = ref(false)
const tencentKey = import.meta.env.VITE_TENCENT_MAP_KEY || ''
let map: any
let markerLayer: any
let circleLayer: any
const points = computed(() => [
  ...props.clusters.map((item) => ({ id: `c-${item.clusterId}`, lat: item.centroidLatitude, lng: item.centroidLongitude, kind: 'cluster', label: `${item.requestCount} 项`, weight: item.totalUnits })),
  ...props.requests.map((item) => ({ id: `r-${item.id}`, lat: Number(item.latitude), lng: Number(item.longitude), kind: 'request', label: `#${item.id}`, weight: item.quantity })),
])
function x(lng: number) { return ((lng - 120.8) / (122.0 - 120.8)) * 100 }
function y(lat: number) { return 100 - ((lat - 30.65) / (31.9 - 30.65)) * 100 }

function loadTencentMap(): Promise<any> {
  if ((window as any).TMap) return Promise.resolve((window as any).TMap)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tencent-map]')
    if (existing) { existing.addEventListener('load', () => resolve((window as any).TMap)); existing.addEventListener('error', reject); return }
    const script = document.createElement('script')
    script.dataset.tencentMap = 'true'
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(tencentKey)}`
    script.async = true
    script.onload = () => resolve((window as any).TMap)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function initializeMap() {
  if (!tencentKey || !mapElement.value) return
  try {
    const TMap = await loadTencentMap()
    map = new TMap.Map(mapElement.value, { center: new TMap.LatLng(31.2304, 121.4737), zoom: 10.5, pitch: 0, rotation: 0 })
    renderLayers()
  } catch (_) { mapError.value = true }
}

function renderLayers() {
  if (!map) return
  const TMap = (window as any).TMap
  markerLayer?.setMap(null)
  circleLayer?.setMap(null)
  markerLayer = new TMap.MultiMarker({
    map,
    geometries: props.requests.map(item => ({ id: `request-${item.id}`, position: new TMap.LatLng(Number(item.latitude), Number(item.longitude)), properties: { title: `需求 #${item.id}` } })),
  })
  circleLayer = new TMap.MultiCircle({
    map,
    styles: { cluster: new TMap.CircleStyle({ color: 'rgba(198,92,63,.24)', showBorder: true, borderColor: '#c65c3f', borderWidth: 2 }) },
    geometries: props.clusters.map(item => ({ id: `cluster-${item.clusterId}`, styleId: 'cluster', center: new TMap.LatLng(item.centroidLatitude, item.centroidLongitude), radius: Math.min(3000, 500 + item.totalUnits * 40) })),
  })
}

onMounted(initializeMap)
watch(() => [props.clusters, props.requests], renderLayers, { deep: true })
onBeforeUnmount(() => { markerLayer?.setMap(null); circleLayer?.setMap(null); map?.destroy?.() })
</script>

<template>
  <div class="operations-map">
    <div v-if="tencentKey && !mapError" ref="mapElement" class="tencent-map" aria-label="腾讯位置服务需求地图"></div>
    <svg v-else viewBox="0 0 1000 620" role="img" aria-label="上海需求点示意地图">
      <defs><linearGradient id="water" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#edf5f2"/><stop offset="1" stop-color="#dbece7"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".18"/></filter></defs>
      <rect width="1000" height="620" rx="24" fill="url(#water)" />
      <path d="M380 0 C430 100 410 180 480 250 C550 320 515 420 610 620" fill="none" stroke="#bad6ce" stroke-width="38" opacity=".75" />
      <path d="M380 0 C430 100 410 180 480 250 C550 320 515 420 610 620" fill="none" stroke="#e8f4f0" stroke-width="18" opacity=".8" />
      <g opacity=".42" stroke="#9fbbb2" stroke-width="1"><path v-for="i in 10" :key="`h-${i}`" :d="`M0 ${i*62} H1000`"/><path v-for="i in 16" :key="`v-${i}`" :d="`M${i*62.5} 0 V620`"/></g>
      <text x="42" y="54" class="map-title">SHANGHAI · DEMAND COVERAGE</text>
      <g v-for="point in points" :key="point.id" :transform="`translate(${x(point.lng)*10},${y(point.lat)*6.2})`">
        <circle v-if="point.kind==='cluster'" :r="Math.min(34, 14 + point.weight)" class="cluster-halo" />
        <circle :r="point.kind==='cluster' ? 9 : 4.5" :class="point.kind" filter="url(#shadow)" />
        <text v-if="point.kind==='cluster'" x="14" y="4" class="point-label">{{ point.label }}</text>
      </g>
    </svg>
    <div class="map-legend"><span><i class="legend-request"></i>单条需求</span><span><i class="legend-cluster"></i>需求聚类</span></div>
    <p v-if="!tencentKey || mapError" class="map-note">未配置腾讯位置服务 Web Key，当前显示离线地理示意层。</p>
  </div>
</template>
