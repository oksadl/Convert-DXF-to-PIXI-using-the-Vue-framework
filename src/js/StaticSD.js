import { PixiGraphicsTool } from './PixiGraphicsTool.js'
import * as PIXI from 'pixi.js'
import { calcTools } from './calcTools.js'
import CAD_COLORS from './CAD_COLORS.js'

export class StaticSD extends PixiGraphicsTool {
  constructor(container, options) {
    super(container, options)

    // 站场图初始量
    this.xGrid = options.nXGrid || 21
    this.yGrid = options.nYGrid || 21
    this.lineW = options.nLineW || 3

    // 上一个被点击的对象
    this.oldClickContainer = null
  }

  /**
   * 静态方法，用于创建实例并等待初始化完成
   */
  static async create(container, options = {}) {
    const instance = new StaticSD(container, options)
    await instance.init()
    // 绑定额外的事件
    StaticSD.createdInstance = instance
    return instance
  }

  // 创建的实例
  static createdInstance = null

  /* ------------ dxf读取 -----------*/
  static dxfAllData = null
  // dxf文件管理工具， 以entity的handle作索引
  static dxfManager = {}
  /**
   * dxf读取
   * @param {JSON} dxf dxf文件解析出的json
   * @param {Object} entManager dxf文件中entities里的所有类别整合
   * @param {Function} containerClickE 单组entity点击事件
   */
  readDXFJSON(dxf, entManager = {}, containerClickE = null) {
    // 转化尺寸，利用现有的entities里的textheight的最小值为准
    // 用来规划线段宽度
    let unitLen = 1
    let minH = Infinity
    dxf.entities.forEach((ent) => {
      if (ent.textHeight && ent.textHeight < minH) {
        minH = ent.textHeight
      }
    })
    // 近似使用arrowSize处理
    const arrowSize = dxf.header.dimArrowSize || 1
    if (minH * arrowSize < 16 && minH > 0) {
      unitLen = 16 / Math.max(4, minH * arrowSize)
    }
    // 翻转数组
    function reversePoints(data) {
      if (!data) {
        return null
      }
      let p = JSON.parse(JSON.stringify(data))
      // 所有y轴取反
      if (p.length) {
        p.forEach((point) => {
          point.y *= -1
          if (point.z) delete point.z
        })
      } else if (p.y) {
        p.y *= -1
        if (p.z) delete p.z
      }
      return p
    }

    // 处理table
    function dealTable(ent) {
      const layer = dxf.tables && dxf.tables.layers[ent.layer]

      // 隐藏
      if (
        !layer ||
        layer.flags & (0x01 !== 0) ||
        ['隐藏', '标注'].includes(layer.name) ||
        layer.colorNumber < 0
      ) {
        return
      }

      // 线段样式
      let pattern = dxf.tables && dxf.tables.ltypes && dxf.tables.ltypes[ent.lineTypeName]
      pattern && (ent.pattern = pattern)

      // 颜色, 最后处理
      let color
      // 如果不是有用的color，则使用layer的颜色
      if (ent.color && CAD_COLORS[ent.color]) {
        color = ent.color
      } else if (layer) {
        color = layer.colorNumber
      }

      color = CAD_COLORS[color]

      if (color !== undefined) {
        ent.color = color
      }

      return { ...ent }
    }

    function findName(obj, objKey, name) {
      const allRes = []
      const keyArr = Object.keys(obj)
      for (let index = 0; index < keyArr.length; index++) {
        const val = obj[keyArr[index]]
        if (val[objKey] === name) {
          return val
        }
      }
    }

    // 储存dxf全部信息
    StaticSD.dxfAllData = dxf

    //所有INSERT类型处理
    function dealBlock(bl) {
      if (bl.entities && bl.entities.length) {
        bl.entities.forEach((item) => {
          const targetBlock = findName(dxf.blocks, 'name', item.block)
          if (item.type === 'INSERT' && targetBlock) {
            item.entities = targetBlock.entities
          }
        })
      } else {
        bl.entities = []
      }
      return bl
    }
    let blocks = dxf.blocks.map((bl) => dealBlock(bl))

    entManager.INSERT?.forEach((insertItem) => {
      const targetBlock = findName(blocks, 'name', insertItem.block)
      if (targetBlock) {
        const entities = JSON.parse(JSON.stringify(targetBlock.entities))
        insertItem.entities = entities
      }
    })

    // 提取 DXF 中的实体（如直线、圆、多段线等
    const entities = [...dxf.entities]
    // console.log("entities:", entities);
    // 用于定位视角到指定的位置，以线条位置为准计算大致位置
    let xMin = Infinity,
      yMin = Infinity
    let xMax = -Infinity,
      yMax = -Infinity

    let containerArr = []
    let containerHandle = {}

    const textScaleCorrect = 1 // 字体放大缩小

    const drawDxfEntities = (entities, parentContainer = null, insertDrawStyle = {}) => {
      // 遍历实体并绘制
      for (let index = 0; index < entities.length; index++) {
        let afterHandle = null
        const ent = dealTable(entities[index])
        if (!ent) {
          continue
        }
        // 实例对象
        let points = reversePoints(ent.vertices)
        let container
        if (parentContainer) {
          container = parentContainer
        } else {
          container = new SelectableContainer()
          container.devName = ent.handle
          container.boxType = 'DXF'
        }
        const drawChildren = (container, drawStyle = insertDrawStyle) => {
          switch (ent.type) {
            case 'LINE': {
              let points = reversePoints([ent.start, ent.end])
              const graphics = this.drawLine(points, {
                width: 1 / unitLen,
                color: CAD_COLORS[ent.colorNumber] || ent.color,
                ...drawStyle,
              })
              container.addChild(graphics)
              // 定位
              xMin = Math.min(points[0].x, xMin)
              yMin = Math.min(points[0].y, yMin)
              xMax = Math.max(points[0].x, xMax)
              yMax = Math.max(points[0].y, yMax)
              break
            }
            case 'LWPOLYLINE':
            case 'POLYLINE': {
              // closed为true时需要保证首尾相连
              let graphics
              if (ent.closed) {
                graphics = this.drawLine([...points, points[0]], {
                  width: 1 / unitLen,
                  color: CAD_COLORS[ent.colorNumber] || ent.color,
                  ...drawStyle,
                })
              } else if (ent.pattern && ent.pattern.pattern && ent.pattern.pattern.length) {
                graphics = this.drawDashLine(points, ent.pattern.pattern, {
                  width: 1 / unitLen,
                  color: CAD_COLORS[ent.colorNumber] || ent.color,
                  ...drawStyle,
                })
              } else {
                graphics = this.drawLine(points, {
                  width: 1 / unitLen,
                  color: CAD_COLORS[ent.colorNumber] || ent.color,
                  ...drawStyle,
                })
              }
              container.addChild(graphics)
              break
            }
            case 'CIRCLE': {
              let graphics = this.drawCircle(
                reversePoints({ x: ent.x, y: ent.y }),
                ent.radius || ent.r,
                {
                  color: ent.color,
                  lineWidth: 1 / unitLen,
                  lineColor: ent.colorNumber ? CAD_COLORS[ent.colorNumber] : ent.color,
                  fillColor: this.bgcColor,
                  ...drawStyle,
                },
              )
              container.addChild(graphics)
              break
            }
            case 'TEXT': {
              // 拿去左上的点位
              let { x, x2, y, y2 } = ent
              let point = {
                x: ent.x,
                y: -ent.y,
              }
              const scaleFactor = 16 / (ent.textHeight * textScaleCorrect)
              let graphics = this.drawText(ent.string, point, {
                color: ent.color,
                fontSize: 16,
                color: CAD_COLORS[ent.colorNumber] || ent.color,
                ...drawStyle,
              })
              graphics.scale.set(1 / scaleFactor)
              const newStyle = graphics.getBounds()
              if (ent.hAlign !== undefined && ent.vAlign !== undefined) {
                let xPos, yPos
                switch (ent.hAlign) {
                  // 水平对齐
                  case 1: {
                    // 居中
                    xPos = x2 - newStyle.width / 2
                    // 方位居中时，文本也要居中对齐
                    graphics.style.align = 'center'
                    break
                  }
                  case 2: {
                    // 右
                    xPos = x2 - newStyle.width
                    // 方位居中时，文本也要居中对齐
                    graphics.style.align = 'right'
                    break
                  }
                  default: {
                    // 默认方向为左对齐
                    xPos = x2 !== undefined ? x2 : x
                  }
                }
                switch (ent.vAlign) {
                  // 垂直对齐
                  case 2: {
                    // 居中
                    yPos = -y2 - newStyle.height / 2
                    break
                  }
                  case 3: {
                    // 顶部
                    yPos = -y2
                    break
                  }
                  default: {
                    // 默认方向为底部对齐 / 基线对齐
                    yPos = -(y2 !== undefined ? y2 : y) - newStyle.height
                  }
                }
                graphics.position.set(xPos, yPos)
              } else {
                // 如果没有hlign和vlign，则直接绘制, 默认左下角对齐
                point.y -= newStyle.height
                graphics.position.set(point.x, point.y)
              }
              container.addChild(graphics)
              break
            }
            case 'ARC': {
              // 翻转点位
              const center = reversePoints({ x: ent.x, y: ent.y, z: ent.z })
              let graphics = this.drawSector(
                center,
                ent.radius || ent.r,
                -ent.startAngle,
                -ent.endAngle,
                {
                  color: ent.color,
                  lineWidth: 1 / unitLen,
                  lineColor: CAD_COLORS[ent.colorNumber],
                  fillAlpha: 0,
                  isConnectCenter: false,
                  anticlockwise: true,
                  ...drawStyle,
                },
              )
              container.addChild(graphics)
              break
            }
            case 'MTEXT': {
              // 清理文本
              let content = ent.string.replace(/\\P/g, '\n').replace(/{\\.*?}/g, '')

              const eHFactor = (mtextString) => {
                const regex = /\\H([^;}\\]*)/
                const match = mtextString.match(regex)
                return match ? match[1] : null
              }
              const matchT = eHFactor(content)
              let result = content.replace(/\\H[^;}\\]*[;}]/g, '')
              content = result.replace(/[\{\}]/g, '')

              let cadPos = ''
              const cadPosMap = {
                '\\pxqc;': 'center',
                '\\pql;': 'left',
                '\\pqr;': 'right',
                '\\pqj;': '', //两端对齐，默认不变
              }
              Object.keys(cadPosMap).forEach((cp) => {
                if (content.includes(cp)) {
                  content = content.replace(cp, '')
                  cadPos = cadPosMap[cp]
                }
              })

              let textHeight = ent.nominalTextHeight * textScaleCorrect

              if (matchT) {
                if (matchT.slice(-1) == 'x') {
                  const num = matchT.slice(0, -1)
                  textHeight *= num
                } else if (matchT.slice(-1) == '+') {
                  const num = matchT.slice(0, -1)
                  textHeight += num
                } else {
                  console.warn('未处理的\\H')
                }
              }
              textHeight = parseFloat(textHeight.toFixed(3))
              let scaleFactor = 16 / textHeight
              // 计算行高
              let lineHeight = textHeight * 1.25 * scaleFactor
              let singleWordWrap = ent.refRectangleWidth < ent.nominalTextHeight * 2
              // 创建样式
              const textStyle = {
                fontFamily: 'Arial',
                fontSize: 16,
                fill: CAD_COLORS[ent.colorNumber] || ent.color,
                breakWords: true,
                lineHeight,
                wordWrap: singleWordWrap || ent.columnWidth !== undefined,
                wordWrapWidth: ent.refRectangleWidth * scaleFactor * textScaleCorrect,
                ...drawStyle,
              }
              let point = {
                x: ent.x,
                y: -ent.y,
              }
              // 创建文本对象
              const text = this.drawText(content, point, {
                ...textStyle,
                ...drawStyle,
              })
              text.scale.set(1 / scaleFactor)
              let newStyle = text.getBounds()
              const centerPoint = {
                x: ent.x,
                y: -ent.y,
              }
              let xPos, yPos
              if (ent.attachmentPoint) {
                // 水平方向
                switch (ent.attachmentPoint % 3) {
                  case 1:
                    // 左
                    xPos = centerPoint.x
                    break
                  case 2:
                    // 中
                    xPos = centerPoint.x - newStyle.width / 2
                    // 方位居中时，文本也要居中对齐
                    text.style.align = 'center'
                    break
                  case 0:
                    // 右
                    xPos = centerPoint.x - newStyle.width
                    text.style.align = 'right'
                    break
                }
                // 垂直方向
                switch (Math.ceil(ent.attachmentPoint / 3)) {
                  case 1:
                    // 顶部
                    yPos = centerPoint.y
                    break
                  case 2:
                    // 中间
                    yPos = centerPoint.y - newStyle.height / 2
                    break
                  case 3:
                    // 底部
                    yPos = centerPoint.y - newStyle.height
                    break
                }
              }
              switch (cadPos) {
                case 'center':
                  xPos += ent.horizontalWidth / 2
                  break
                case 'right':
                  xPos += ent.horizontalWidth
                  break
                default:
                // 不处理，即左侧对齐
              }

              text.position.set(xPos, yPos)
              container.addChild(text)
              break
            }
            case 'HATCH': {
              const hatchLen = 0.5
              let alphaValue = 1
              if (ent.transparency) {
                alphaValue = ent.transparency.toFixed(1)
              }
              if (
                (ent.fillType === 'SOLID' && ent.patternName === 'SOLID') ||
                (ent.fillType === 'PATTERN' && ent.pattern)
              ) {
                // 绘制hatch以及剖面线
                const hatchContainer =
                  ent.fillType === 'SOLID' ? container : new SelectableContainer()
                ent.boundary.loops.forEach((loop) => {
                  for (let index = 0; index < loop.references.length; index++) {
                    const refer = loop.references[index]
                    // 找到第一个父元素，也就是最后引入的父元素就终止循环
                    if (containerHandle[refer]) {
                      afterHandle = refer
                      break
                    }
                  }
                  let loopPolyEnts = []
                  // 处理每个环中的实体
                  loop.entities.forEach((boundaryEnt) => {
                    // 多段线时，一个ent就是一个实体，所以要单独处理
                    if (boundaryEnt.type === 'POLYLINE') {
                      // 提取多段线点
                      points = reversePoints(boundaryEnt.points)
                      boundaryEnt.parentHatch = ent
                      boundaryEnt.parentLoop = loop
                      // 多边形填充判断符
                      let rtnFlag = false
                      if (boundaryEnt.closed) {
                        points = [...points, points[0]]
                        // 如果是闭合且有凸度的多段线，需要转换为圆弧
                        if (!loop.hasBulge) {
                          // 绘制填充多边形
                          const graphics = this.drawPolygon(points, {
                            lineWidth: hatchLen / unitLen,
                            lineColor: CAD_COLORS[ent.colorNumber] || ent.color,
                            fillColor: CAD_COLORS[ent.colorNumber] || this.bgcColor, // 使用实体颜色填充
                            fillAlpha: alphaValue,
                            ...drawStyle,
                          })
                          hatchContainer.addChild(graphics)
                          rtnFlag = true
                        }
                      }
                      if (!rtnFlag) {
                        const lineStyle = {
                          color: CAD_COLORS[ent.colorNumber] || ent.color,
                          width: hatchLen / unitLen,
                          alpha: alphaValue,
                          ...drawStyle,
                        }

                        const graphics = new PIXI.Graphics()
                        graphics.setStrokeStyle(lineStyle)
                        graphics.moveTo(points[0].x, points[0].y)

                        for (let index = 0; index < points.length - 1; index++) {
                          const p = points[index]
                          const p2 = points[index + 1]
                          if (p.bulge) {
                            // 计算弦长
                            // 上面已经转换过-y
                            const { center, radius, startAngle, endAngle } =
                              calcTools.calculateArcFromBulge(p, p2, p.bulge)
                            graphics.arc(
                              center.x,
                              center.y,
                              radius,
                              startAngle,
                              endAngle,
                              p.bulge > 0, // 凸度值决定旋转方向
                            )
                          } else {
                            graphics.lineTo(p2.x, p2.y)
                          }
                        }
                        graphics.closePath()
                        graphics.fill({
                          color: CAD_COLORS[ent.colorNumber] || ent.color,
                          alpha: alphaValue,
                          ...drawStyle,
                        })
                        graphics.stroke()
                        hatchContainer.addChild(graphics)
                      }
                    } else {
                      loopPolyEnts.push(boundaryEnt)
                    }
                  })
                  // 有其他线且总点数为3个及以上，则绘制封闭图形
                  if (loopPolyEnts.length) {
                    const lineStyle = {
                      color: CAD_COLORS[ent.colorNumber] || ent.color,
                      width: hatchLen / unitLen,
                      alpha: alphaValue,
                      ...drawStyle,
                    }
                    const graphics = new PIXI.Graphics()
                    graphics.setStrokeStyle(lineStyle)
                    // 是否已经开始绘制
                    let moveToPoint = null
                    loopPolyEnts.forEach((ent) => {
                      switch (ent.type) {
                        case 'LINE': {
                          if (!moveToPoint) {
                            const { x, y } = reversePoints(ent.start)
                            graphics.moveTo(x, y)
                            moveToPoint = { x, y }
                          }
                          const { x, y } = reversePoints(ent.end)
                          graphics.lineTo(x, y)
                          break
                        }
                        case 'ARC': {
                          const { center, startAngle, endAngle, radius } = ent
                          const start = {
                            x: center.x + radius * Math.cos(-startAngle),
                            y: -center.y + radius * Math.sin(-startAngle),
                          }
                          if (!moveToPoint) {
                            graphics.moveTo(start.x, start.y)
                            moveToPoint = start
                          }
                          graphics.arc(
                            center.x,
                            -center.y,
                            radius,
                            startAngle * (Math.PI / 180) * (ent.counterClockWise ? -1 : 1),
                            endAngle * (Math.PI / 180) * (ent.counterClockWise ? -1 : 1),
                            ent.counterClockWise, // true为逆时针，其他为顺时针
                          )
                          break
                        }
                        default: {
                          console.log('未处理线段', ent)
                        }
                      }
                    })
                    graphics.closePath()
                    graphics.fill({
                      color: CAD_COLORS[ent.colorNumber] || ent.color,
                      alpha: alphaValue,
                      ...drawStyle,
                    })
                    graphics.stroke()
                    hatchContainer.addChild(graphics)
                  }
                })
                if (ent.fillType === 'PATTERN') {
                  // 判断种子点，暂时兼容
                  if (ent.seeds?.seeds?.length) {
                    const uniSeeds = Array.from(new Set(ent.seeds.seeds))
                    // 反向遍历，方便删除
                    for (let index = hatchContainer.children.length - 1; index >= 0; index--) {
                      const child = hatchContainer.children[index]
                      const { minX, maxX, minY, maxY } = child.getBounds()
                      const isRight = uniSeeds.some((seed) => {
                        let { x, y } = seed
                        y *= -1 // y轴翻转
                        return minX < x && maxX > x && minY < y && maxY > y
                      })
                      if (!isRight) {
                        hatchContainer.removeChild(child)
                      }
                    }
                  }
                  // 取出剖面线需要的各个属性
                  const fillParams = {
                    patternAngle: ent.pattern.angle, // 度数
                    spacing: ent.spacing * unitLen, // 线间距
                    offsetX: ent.pattern.offsetX, // X偏移
                    offsetY: -ent.pattern.offsetY, // Y偏移，坐标系倒转需要取负值
                    color: CAD_COLORS[ent.colorNumber] || ent.color, // 线条颜色
                    lineWidth: hatchLen / unitLen, // 线宽
                    alpha: alphaValue,
                    ...drawStyle,
                  }
                  let fillGraphics = calcTools.createANSIFill(hatchContainer, fillParams)
                  fillGraphics && container.addChild(fillGraphics)
                }
              } else {
                console.warn('未处理的对象', ent)
              }

              containerClickE && (container.clickE = containerClickE)
              break
            }
            case 'INSERT': {
              const xScale = ent.scaleX || 1
              const yScale = ent.scaleY || 1
              const rotation = ent.rotation || 0 // 弧度或度
              const entities = ent.entities.map((childEnt) => {
                const newEntity = JSON.parse(JSON.stringify(childEnt))
                // 平移vertices
                if (Array.isArray(newEntity.vertices)) {
                  newEntity.vertices = newEntity.vertices.map((pt) => ({
                    x: pt.x * xScale + ent.x,
                    y: pt.y * yScale + ent.y,
                  }))
                } else if (newEntity.start && newEntity.end) {
                  ;[newEntity.start, newEntity.end].forEach((pt) => {
                    pt.x = pt.x * xScale + ent.x
                    pt.y = pt.y * yScale + ent.y
                  })
                } else if (newEntity.boundary && newEntity.boundary.loops) {
                  newEntity.boundary.loops.forEach((loop) => {
                    loop.entities.forEach((lEnt) => {
                      if (lEnt.points) {
                        lEnt.points.forEach((pt) => {
                          pt.x = pt.x * xScale + ent.x
                          pt.y = pt.y * yScale + ent.y
                        })
                      } else if (lEnt.start && lEnt.end) {
                        ;[lEnt.start, lEnt.end].forEach((pt) => {
                          pt.x = pt.x * xScale + ent.x
                          pt.y = pt.y * yScale + ent.y
                        })
                      } else {
                        console.warn('有未处理的loops')
                      }
                    })
                  })
                } else if (newEntity.x && newEntity.y) {
                  newEntity.x = newEntity.x * xScale + ent.x
                  newEntity.y = newEntity.y * yScale + ent.y

                  if (rotation !== 0) {
                    const cosTheta = Math.cos(rotation)
                    const sinTheta = Math.sin(rotation)
                    const rotatedX =
                      (newEntity.x - ent.x) * cosTheta - (newEntity.y - ent.y) * sinTheta + ent.x
                    const rotatedY =
                      (newEntity.x - ent.x) * sinTheta + (newEntity.y - ent.y) * cosTheta + ent.y
                    newEntity.x = rotatedX
                    newEntity.y = rotatedY
                  }
                } else {
                  console.log('有未处理的类型', newEntity, ent)
                }
                newEntity.colorNumber = ent.colorNumber
                newEntity.parentInsert = ent
                return newEntity
              })
              drawDxfEntities(entities, container, drawStyle)
              break
            }

            default:
              if (ent.type !== 'VIEWPORT') console.log(`Unsupported ent type: ${ent.type}`)
          }
        }
        drawChildren(container)
        // 如果有父类container，则不执行下述操作
        if (parentContainer) continue
        // 如果没有点击事件，则可以穿透下层
        if (!container.clickE) {
          container.interactive = false
          container.interactiveChildren = false
        }
        let afterIndex
        // 如果有依赖的父元素，则在其后渲染
        if (afterHandle) {
          // 遍历舞台的所有子元素
          for (let i = 0; i < this.app.stage.children.length; i++) {
            const child = this.app.stage.children[i]
            if (child.devName && child.devName === afterHandle) {
              afterIndex = i
              break // 找到第一个匹配项后退出循环
            }
          }
        }
        if (afterHandle && afterIndex >= 0) {
          this.app.stage.addChildAt(container, afterIndex + 1)
        } else {
          this.app.stage.addChild(container)
        }
        containerArr.push(container)
        if (containerHandle[ent.handle]) {
          console.warn('已有这个handle', containerHandle[ent.handle], container)
        } else {
          containerHandle[ent.handle] = container
        }
        // 完成子图形添加调用该方法
        // container.endAddChildren();
        // 添加单体拖拽
        // this.bindDragEvent(container);
        // 存储该对象
        container.devData = ent
        container.setNewStyle = (newStyle) => {
          for (let index = container.children.length - 1; index >= 0; index--) {
            const c = container.children[index]
            container.removeChild(c)
            c.destroy(true)
          }
          drawChildren(container, newStyle)
        }
        StaticSD.dxfManager[ent.handle] = container
      }
    }

    // drawDxfEntities(entities);
    // 将entities分类，先加载除text、hatch、insert之外的，再加载hatch和insert，最后加载text
    let textEnts = [],
      hatchEnts = [],
      otherEnts = []
    entities.forEach((ent) => {
      if (ent.type === 'TEXT' || ent.type === 'MTEXT') textEnts.push(ent)
      // else if (ent.type === "HATCH") {
      //   hatchEnts.push(ent);
      // }
      else otherEnts.push(ent)
    })
    // drawDxfEntities(hatchEnts);
    drawDxfEntities(otherEnts)
    drawDxfEntities(textEnts)
    // drawDxfEntities(entities)

    if (dxf.header && dxf.header.extMax && dxf.header.extMin) {
      xMin = dxf.header.extMin.x
      xMax = dxf.header.extMax.x
      yMin = -dxf.header.extMax.y
      yMax = -dxf.header.extMin.y
    }

    const maxSide = 5000
    const minSide = 1200
    /* ---container超长时缩小内部所有个体--- */
    // 缩小内部container（如果超长）
    let maxLength = Math.max(yMax - yMin, xMax - xMin)
    // 缩小的倍数
    let cScale = 1
    while (maxLength / cScale > maxSide * 1.5) {
      cScale *= 1.1
    }
    containerArr.forEach((c) => {
      c.scale.set(1 / cScale)
    })
    xMax /= cScale
    xMin /= cScale
    yMax /= cScale
    yMin /= cScale
    maxLength /= cScale

    /* ---整个画布放大缩小--- */
    // 计算容器大小，缩小整个画布
    const rect = this.container.getBoundingClientRect()
    let smallerScale = 1
    while (Math.abs(yMax - yMin) > smallerScale * rect.height && smallerScale < this.maxScale) {
      smallerScale *= 1.1
    }
    let largerScale = 1
    // 适度放大
    while (maxLength * largerScale < minSide && largerScale < this.maxScale) {
      largerScale *= 1.1
    }

    const finalScale = largerScale / smallerScale
    this.app.stage.scale.set(finalScale)
    this.scale = finalScale

    // 需要注意，y轴坐标是相反的
    // 定位位置, 如果定位超过5000，则调整所有container的位置
    if (
      Math.abs(xMin) > maxSide ||
      Math.abs(yMin) > maxSide ||
      Math.abs(xMax) > maxSide ||
      Math.abs(yMax) > maxSide
    ) {
      const xHalf = Math.abs((xMax - xMin) / 2)
      const yHalf = Math.abs((yMax - yMin) / 2)
      // 所有container加上矫正值
      containerArr.forEach((c) => {
        c.x += -xHalf - xMin
        c.y += -yHalf - yMin
      })
      xMax = xHalf
      yMax = yHalf
      xMin = -xHalf
      yMin = -yHalf
    }
    let xCenter = ((xMax + xMin) / 2) * finalScale - rect.width / 2
    let yCenter = ((yMax + yMin) / 2) * finalScale - rect.height / 2
    this.app.stage.position.x = -xCenter
    this.app.stage.position.y = -yCenter
  }
}

/**
 * 可选择对象，会在选择之后加入一个背景选择框
 */
export class SelectableContainer extends PIXI.Container {
  constructor() {
    super()
    this.interactive = true
    this.selected = false
    this.highlight = {}
    // 回调方法
    this.clickE = null

    let clickTime = null
    this.on('click', (e) => {
      // 判断单双击
      if (clickTime === null) {
        clickTime = 0
        setTimeout(() => {
          if (clickTime >= 2) {
            this.clickE.dblClick && this.clickE.dblClick(this, e)
          } else {
            this.clickE.click && this.clickE.click(this, e)
          }
          clickTime = null
        }, 200)
      }
      clickTime++
    })
    this.on('rightclick', (e) => {
      this.clickE.rightClick && this.clickE.rightClick(this, e)
    })
  }

  // 选中状态
  toggleSelection(state = false) {
    this.selected = state
    this.highlight.visible = state
  }

  // 结束渲染时加一个底层矩阵
  endAddChildren() {
    const bound = this.getBounds()
    const instance = StaticSD.createdInstance
    this.highlight = instance.drawRect(
      { x: instance.xOffset + bound.left, y: instance.yOffset + bound.top },
      bound.width,
      bound.height,
      {
        lineWidth: 1,
        lineColor: 0xff0000,
        fillColor: instance.options.backgroundColor,
      },
    )
    this.addChildAt(this.highlight, 0)
    this.toggleSelection()
  }
}
