<template>
  <div style="position: relative; width: 100%; height: 100%">
    <div ref="dxfContainer" class="dxf-preview" id="dxf-container"></div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { StaticSD } from '@/js/StaticSD.js'
import { parseString } from '@/utils/dxf/index.js'

let dxfContainer = ref(null)

fetch('/temp.dxf').then(async (res) => {
  if (res.status === 200) {
    const dxfText = await res.text()
    init(dxfText)
  }
})

// 绘制图纸
async function init(dxfText, clickOn = true) {
  try {
    // 处理dxf文本数据
    const dxf = parseString(dxfText)
    let entManager = classifyDxf(dxf)

    // 销毁之前的图纸
    if (StaticSD.createdInstance) {
      StaticSD.createdInstance.destroyAll()
      StaticSD.createdInstance = null
    }

    // 创建新实例
    let pixiTools = await StaticSD.create(dxfContainer.value, {
      backgroundColor: 0x000000,
    })
    pixiTools.app.stage.position.y *= -1
    // console.log(dxf, "dxf");

    StaticSD.createdInstance.readDXFJSON(dxf, entManager, {
      click: (obj) => {
        console.log(obj)
      },
    })
  } catch (error) {
    console.error('Error:', error)
  }
}

// 对dxf数据分类
function classifyDxf(data) {
  let entManager = {}
  data.entities.forEach((ent) => {
    if (ent.ownerHandle) {
      if (!entManager[ent.ownerHandle]) {
        entManager[ent.ownerHandle] = []
      }
      entManager[ent.ownerHandle].push(ent)
    }
    if (ent.type) {
      if (!entManager[ent.type]) {
        entManager[ent.type] = []
      }
      entManager[ent.type].push(ent)
    }
  })
  console.log(entManager, '分类')
  let blockManager = {}
  Object.values(data.blocks).forEach((v) => {
    if (v.entities) {
      v.entities.forEach((ent) => {
        if (!blockManager[ent.type]) {
          blockManager[ent.type] = []
        }
        blockManager[ent.type].push(ent)
      })
    }
  })
  // console.log(blockManager, "block分类");

  return entManager
}
</script>

<style lang="scss" scoped>
.dxf-preview {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
