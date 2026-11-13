// Renders one page: the render function compiled from its WXML, against its data. Every setData
// bumps record.tick, which re-renders the page like WeChat's view update.
import { defineComponent, type PropType } from 'vue'
import { renders } from 'virtual:miniapp'
import { templateContext, type PageRecord } from '../page'

export default defineComponent({
  name: 'PageContent',
  props: { record: { type: Object as PropType<PageRecord>, required: true } },
  setup(props) {
    const render = renders[props.record.route]
    const context = templateContext(props.record)
    const cache: unknown[] = []
    return () => {
      void props.record.tick.value
      return render(context, cache)
    }
  }
})
