import * as PIXI from "pixi.js";
import { calcTools } from "./calcTools";

/**
 * PixiJS 图形绘制工具类
 */
export class PixiGraphicsTool {
  /**
   * 构造函数
   * @param {HTMLElement} container - 要添加Canvas的DOM容器
   * @param {Object} [options={}] - 应用配置选项
   * @param {number} [options.width=800] - 画布宽度
   * @param {number} [options.height=600] - 画布高度
   * @param {number|string} [options.backgroundColor=0xf0f0f0] - 背景颜色
   * @param {boolean} [options.antialias=true] - 是否抗锯齿
   * @param {boolean} [options.autoDensity=true] - 是否自动适应DPI
   * @param {number} [options.resolution=window.devicePixelRatio] - 分辨率
   */
  constructor(container, options = {}) {
    if (!container) {
      throw new Error("必须提供有效的DOM容器");
    }

    this.container = container;
    // 绑定到容器事件
    this.bindContainerEvents();
    this.options = {
      backgroundColor: 0x333333,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      ...options,
    };
    // 默认背景色
    this.bgcColor = this.options.backgroundColor;
    this.app = null;
    // 按下的按键（用于判断拖拽是否为左键行为）
    this.pointerDownButton = null;

    // 画布用量
    this.isDragging = false; // 是否正在拖拽
    this.allowClick = true; // 是否允许触发点击事件
    this.lastMousePosition = null; // 上一次指针位置
    this.scale = options.scale || 1; // 初始缩放比例
    this.minScale = options.minScale || 0.01; // 最小缩放比例
    this.maxScale = options.maxScale || 100; // 最大缩放比例
    this.scaleStep = options.scaleStep || 0.1; // 缩放步长
    // this.xOffset = 3000; // x轴偏差
    // this.yOffset = 1600; // y轴偏差

    // 实例用量
    this.selectObj = null; // 拖拽实例对象
    this.fixedGraphics = [];
    this.resizeObserver = null;
  }

  /**
   * 初始化Pixi应用
   */
  async init() {
    this.app = new PIXI.Application();
    // 没有宽高则默认使用容器的宽高, 容器不可为百分比
    await this.app.init(this.options);
    if (!this.options.width && !this.options.height) {
      const rect = this.container.getBoundingClientRect();
      this.app.renderer.resize(rect.width, rect.height);
    }
    // 使用 ResizeObserver 监听容器大小变化
    this.resizeObserver = new ResizeObserver(() => {
      const rect = this.container.getBoundingClientRect();
      this.app.renderer.resize(Math.floor(rect.width), Math.floor(rect.height));
    });
    // 开始监听容器大小变化
    this.resizeObserver.observe(this.container);

    // 改变初始定位
    // this.app.stage.position.x -= this.xOffset;
    // this.app.stage.position.y -= this.yOffset;
    this.container.appendChild(this.app.canvas);
    // 绑定页面事件
    this._bindEvents();
  }

  /**
   * 销毁pixi应用
   */
  destroyAll() {
    // 1. 停止并移除 ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // 2. 销毁 PixiJS 应用
    if (this.app) {
      // 移除画布元素
      if (this.app.canvas && this.app.canvas.parentNode) {
        this.app.canvas.parentNode.removeChild(this.app.canvas);
      }

      // 销毁渲染器、舞台等
      this.app.destroy(true); // 传递 true 会移除所有子元素和事件监听器
      this.app = null;
    }

    this.container = null;
    this.options = null;
  }

  /* draw 绘制图形部分 */

  /**
   * 绘制线段
   * @param {Array} points - 线段点坐标数组，格式为 [{x, y}, ...]
   * @param {Object} [style={}] - 线条样式
   * @param {number} [style.width=2] - 线宽
   * @param {number} [style.color=0x000000] - 颜色
   * @param {number} [style.alpha=1] - 透明度
   * @param {string} [style.cap='round'] - 线帽样式 (butt, round, square)
   * @param {string} [style.join='round'] - 连接样式 (bevel, round, miter)
   * @param {Array} isRender - 是否立即渲染
   * @returns {PIXI.Graphics} 图形对象
   */
  drawLine(points, style = {}, isRender) {
    if (!points || points.length < 2) {
      console.warn("绘制线段需要至少2个点");
      return;
    }

    const graphics = new PIXI.Graphics();
    isRender && this.app.stage.addChild(graphics);
    style.isDragging && this.bindDragEvent(graphics);

    graphics.setStrokeStyle({
      width: this.lineW,
      color: 0x000000,
      alpha: 1,
      ...style,
    });

    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.stroke();

    graphics.drawData = {
      points,
      style,
    };

    return graphics;
  }

  /**
   * 绘制虚线线段
   * @param {Array} points - 线段点坐标数组，格式为 [{x, y}, ...]
   * @param {Array} pattern - 虚线间隔，格式为 [{x, y}, ...]
   * @param {Object} [style={}] - 线条样式
   * @param {number} [style.width=2] - 线宽
   * @param {number} [style.color=0x000000] - 颜色
   * @param {number} [style.alpha=1] - 透明度
   * @param {string} [style.cap='round'] - 线帽样式 (butt, round, square)
   * @param {string} [style.join='round'] - 连接样式 (bevel, round, miter)
   * @param {Array} isRender - 是否立即渲染
   * @returns {PIXI.Graphics} 图形对象
   */
  drawDashLine(points, pattern, style = {}, isRender) {
    if (!points || points.length < 2) {
      console.warn("绘制线段需要至少2个点");
      return;
    }
    const graphics = new PIXI.Graphics();
    isRender && this.app.stage.addChild(graphics);
    style.isDragging && this.bindDragEvent(graphics);
    // 最小线宽
    const minStep = 0.3;
    pattern = pattern.map(p => p.length);
    let minWidth = Math.max(Math.min(Math.abs(...pattern)), minStep);

    let lineStyle = {
      width: this.lineW,
      color: 0x000000,
      alpha: 1,
      ...style,
    };

    lineStyle.width = Math.min(lineStyle.width, minWidth);

    graphics.setStrokeStyle(lineStyle);

    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      let x = points[i - 1].x,
        y = points[i - 1].y;
      const endX = points[i].x,
        endY = points[i].y;

      // 计算方向向量
      const dx = endX - x;
      const dy = endY - y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const directionX = dx / length;
      const directionY = dy / length;

      let currentLength = 0;
      let patternIndex = 0;
      while (currentLength < length) {
        const segmentLength = pattern[patternIndex % pattern.length];
        if (segmentLength > 0) {
          // 绘制线段
          const segmentLength = Math.max(
            pattern[patternIndex % pattern.length],
            minStep
          );
          const segmentEndX =
            x + directionX * Math.min(segmentLength, length - currentLength);
          const segmentEndY =
            y + directionY * Math.min(segmentLength, length - currentLength);
          graphics.lineTo(segmentEndX, segmentEndY);
          currentLength += segmentLength;
        } else {
          // 跳过间隔
          const gapLength = -segmentLength;
          x = x + directionX * gapLength;
          y = y + directionY * gapLength;
          currentLength += gapLength;
          graphics.moveTo(x, y);
        }
        patternIndex++;
      }
    }
    graphics.stroke();

    graphics.drawData = {
      points,
      pattern,
      style,
    };
    return graphics;
  }

  /**
   * 绘制圆形
   * @param {Object} center - 圆心 {x, y}
   * @param {number} radius - 半径
   * @param {Object} [style={}] - 样式配置
   * @param {number} [style.lineWidth=0] - 边框宽度，0表示无边框
   * @param {number} [style.lineColor=0x000000] - 边框颜色
   * @param {number} [style.fillColor=0xffffff] - 填充颜色
   * @param {number} [style.alpha=1] - 透明度
   * @param {number} [style.startAngle=0] - 起始角度(弧度)
   * @param {number} [style.endAngle=Math.PI*2] - 结束角度(弧度)
   * @param {Array} isRender - 是否立即渲染
   * @returns {PIXI.Graphics} 图形对象
   */
  drawCircle(center, radius, style = {}, isRender) {
    const {
      lineWidth = 0,
      lineColor = 0x000000,
      fillColor = 0xffffff,
      alpha = 1,
      fillAlpha = 1,
      startAngle = 0,
      endAngle = Math.PI * 2,
    } = style;

    const graphics = new PIXI.Graphics();
    isRender && this.app.stage.addChild(graphics);
    style.isDragging && this.bindDragEvent(graphics);

    if (lineWidth > 0) {
      graphics.setStrokeStyle({
        width: lineWidth,
        color: lineColor,
        alpha,
        join: "round",
        cap: "round",
      });
    }

    graphics.circle(center.x, center.y, radius, startAngle, endAngle);

    if (fillColor) {
      graphics.fill({ color: fillColor, alpha: fillAlpha });
    }

    if (lineWidth > 0) {
      graphics.stroke();
    }

    return graphics;
  }

  /**
   * 绘制矩形
   * @param {Object} position - 左上角位置 {x, y}
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @param {Object} [style={}] - 样式配置
   * @param {number} [style.lineWidth=0] - 边框宽度
   * @param {number} [style.lineColor=0x000000] - 边框颜色
   * @param {number} [style.fillColor=0xffffff] - 填充颜色
   * @param {number} [style.alpha=1] - 透明度
   * @param {number} [style.radius=0] - 圆角半径
   * @returns {PIXI.Graphics} 图形对象
   * @param {Array} isRender - 是否立即渲染
   */
  drawRect(position, width, height, style = {}, isRender) {
    const {
      lineWidth = 0,
      lineColor = 0x000000,
      fillColor = 0xffffff,
      alpha = 1,
      fillAlpha = 1,
      radius = 0,
    } = style;

    const graphics = new PIXI.Graphics();
    // this.app.stage.addChild(graphics);
    style.isDragging && this.bindDragEvent(graphics);

    if (lineWidth > 0) {
      graphics.setStrokeStyle({
        width: lineWidth,
        color: lineColor,
        alpha,
        join: "round",
        cap: "round",
      });
    }

    if (radius > 0) {
      graphics.roundRect(position.x, position.y, width, height, radius);
    } else {
      graphics.rect(position.x, position.y, width, height);
    }

    if (fillColor) {
      graphics.fill({ color: fillColor, alpha: fillAlpha });
    }

    if (lineWidth > 0) {
      graphics.stroke();
    }

    isRender && this.app.stage.addChild(graphics);

    return graphics;
  }

  /**
   * 绘制多边形
   * @param {Array} points - 多边形顶点坐标数组 [{x, y}, ...]
   * @param {Object} [style={}] - 样式配置
   * @param {number} [style.lineWidth=0] - 边框宽度
   * @param {number} [style.lineColor=0x000000] - 边框颜色
   * @param {number} [style.fillColor=0xffffff] - 填充颜色
   * @param {number} [style.alpha=1] - 透明度
   * @param {Array} isRender - 是否立即渲染
   * @returns {PIXI.Graphics} 图形对象
   */
  drawPolygon(points, style = {}, isRender) {
    const {
      lineWidth = 0,
      lineColor = 0x000000,
      fillColor = 0xffffff,
      fillAlpha = 1,
      alpha = 1,
    } = style;

    const graphics = new PIXI.Graphics();
    isRender && this.app.stage.addChild(graphics);
    style.isDragging && this.bindDragEvent(graphics);

    if (lineWidth > 0) {
      graphics.setStrokeStyle({
        width: lineWidth,
        color: lineColor,
        alpha,
        join: "round",
        cap: "round",
      });
    }

    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.closePath();

    if (fillColor) {
      graphics.fill({ color: fillColor, alpha: fillAlpha });
    }

    if (lineWidth > 0) {
      graphics.stroke();
    }

    return graphics;
  }

  /**
   * 绘制文本
   * @param {string} text - 文本内容
   * @param {Object} position - 位置 {x, y}
   * @param {Object} [style={}] - 文本样式
   * @param {number} [style.fontSize=12] - 字体大小
   * @param {string} [style.fontFamily='Arial'] - 字体
   * @param {number} [style.color=0x000000] - 颜色
   * @param {number} [style.alpha=1] - 透明度
   * @param {string} [style.align='left'] - 对齐方式 (left, center, right)
   * @param {string} [style.textPosition='top' || 'bottom' || medium] - 对齐方式 (left, center, right)
   * @param {Array} isRender - 是否立即渲染
   * @returns {PIXI.Text} 文本对象
   */
  drawText(text, position, style = {}, isRender) {
    const {
      fontSize = 12,
      fontFamily = "Arial",
      color = 0x000000,
      alpha = 1,
      align = "left",
      textPosition = "bottom",
    } = style;

    const textObj = new PIXI.Text({
      text,
      style: {
        fontSize,
        fontFamily,
        fill: color,
        alpha,
        align,
        ...style,
      },
    });
    // 默认中心对齐，并根据style中的textPosition判断在上或者下
    const xPos = position.x - textObj.width / 2;
    let yPos = position.y;
    if (textPosition === "top") {
      yPos -= textObj.height;
    } else if (textPosition === "medium") {
      yPos -= textObj.height / 2;
    }
    textObj.position.set(xPos, yPos);
    isRender && this.app.stage.addChild(textObj);

    return textObj;
  }
  /**
   * 绘制扇形/弧形
   * @param {Object} center - 圆心 {x, y}
   * @param {number} radius - 半径
   * @param {number} startAngle - 起始角度(弧度)
   * @param {number} endAngle - 结束角度(弧度)
   * @param {Object} [style={}] - 样式配置
   * @param {number} [style.lineWidth=0] - 边框宽度
   * @param {number} [style.lineColor=0x000000] - 边框颜色
   * @param {number} [style.fillColor=0xffffff] - 填充颜色
   * @param {number} [style.alpha=1] - 透明度
   * @returns {PIXI.Graphics} 图形对象
   * @param {Array} isRender - 是否立即渲染
   */
  drawSector(center, radius, startAngle, endAngle, style = {}, isRender) {
    const {
      lineWidth = 0,
      lineColor = 0x000000,
      fillColor = 0xffffff,
      fillAlpha = 1,
      alpha = 1,
      isConnectCenter = true, // 是否连接圆心
      anticlockwise = false, // false为顺时针，true为逆时针
    } = style;

    const graphics = new PIXI.Graphics();
    isRender && this.app.stage.addChild(graphics);
    style.isDragging && this.bindDragEvent(graphics);

    if (lineWidth > 0) {
      graphics.setStrokeStyle({
        width: lineWidth,
        color: lineColor,
        alpha,
        join: "round",
        cap: "round",
      });
    }

    if (isConnectCenter) {
      graphics.moveTo(center.x, center.y);
      graphics.arc(
        center.x,
        center.y,
        radius,
        startAngle,
        endAngle,
        anticlockwise
      );
      graphics.lineTo(center.x, center.y);
    } else {
      graphics.arc(
        center.x,
        center.y,
        radius,
        startAngle,
        endAngle,
        anticlockwise
      );
    }

    if (fillColor) {
      graphics.fill({ color: fillColor, alpha: fillAlpha });
    }

    if (lineWidth > 0) {
      graphics.stroke();
    }

    return graphics;
  }

  /* bind container 绑定容器事件部分 */
  bindContainerEvents() {
    this.container.addEventListener("contextmenu", e => {
      e.preventDefault();
    });
    // 记录当前鼠标按下的类型
    this.container.addEventListener("pointerdown", e => {
      this.pointerDownButton = e.button;
    });
  }

  /* bind app.stage 绑定画布事件部分 */
  _bindEvents() {
    this.app.stage.interactive = true;
    this.app.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000);
    // 指针按下事件
    this.app.stage.on("mousedown", this._onMouseDown, this);
    // 指针移动事件
    this.app.stage.on("mousemove", this._onMouseMove, this);
    // 指针释放事件
    this.app.stage.on("mouseup", this._onMouseUp, this);
    // 指针离开舞台事件
    this.app.stage.on("mouseleave", this._onMouseUp, this);
    // 滚轮事件
    this.app.stage.on("wheel", this._onWheel, this);
  }

  // 指针按下
  _onMouseDown(event, obj = null) {
    obj && (this.selectObj = obj);
    this.isDragging = true;
    this.lastMousePosition = event.data.global;
    this.allowClick = true;
  }

  // 指针移动
  _onMouseMove(event) {
    // 拖拽逻辑, 只有左键时才触发
    if (this.isDragging && this.pointerDownButton === 0) {
      // 触发拖动的时候，不触发点击对象的事件
      this.allowClick = false;
      const newPosition = event.data.global;
      const diff = calcTools.calcObject(
        newPosition,
        this.lastMousePosition,
        "-"
      );
      // 如果有选中的对象则按照实例拖动的逻辑实行
      if (this.selectObj) {
        this.selectObj.position.x += diff.x / this.scale;
        this.selectObj.position.y += diff.y / this.scale;
      } else {
        this.app.stage.position.x += diff.x;
        this.app.stage.position.y += diff.y;
      }
      this.lastMousePosition = JSON.parse(JSON.stringify(newPosition));
    }
  }

  // 指针释放
  _onMouseUp() {
    this.isDragging = false;
    this.lastMousePosition = null;
    this.selectObj && (this.selectObj = null);
  }

  // 滚轮事件
  _onWheel(event) {
    event.preventDefault(); // 阻止默认滚动行为

    // 计算缩放方向
    const delta = Math.sign(event.data.deltaY); // 滚轮方向
    let newScale = this.scale - delta * this.scaleStep;

    // 限制缩放范围
    newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

    // 计算缩放中心（鼠标位置）
    const mousePosition = event.data.global;
    const stagePosition = this.app.stage.position;

    // 计算缩放前后的偏移量
    const offsetBeforeScale = calcTools.calcObject(
      mousePosition,
      stagePosition,
      "-"
    );
    const offsetAfterScale = calcTools.calcObject(
      offsetBeforeScale,
      newScale / this.scale,
      "*"
    );
    const diff = calcTools.calcObject(offsetAfterScale, offsetBeforeScale, "-");

    // 应用缩放和偏移
    this.app.stage.scale.set(newScale);
    this.app.stage.position.x -= diff.x;
    this.app.stage.position.y -= diff.y;

    // 将固定像素的container重新置为1
    for (let index = 0; index < this.fixedGraphics.length; index++) {
      const c = this.fixedGraphics[index];
      if (c.drawData && c.parent) {
        const { points, style } = c.drawData;
        style.width /= newScale / this.scale;
        const graphics = this.drawLine(points, style);
        const index = c.parent.getChildIndex(c);
        c.parent.addChildAt(graphics, index);
        c.parent.removeChild(c);
        c.destroy(true);
      } else {
        this.fixedGraphics.splice(index, 1);
        index--;
      }
    }

    // 更新当前缩放比例
    this.scale = newScale;
  }

  /* bind obj(graphics, container等对象) 绑定对象事件部分 */
  // 此处只做拖拽事件的绑定，具体绑定事件用SelectableContainer类里的事件触发逻辑
  bindDragEvent(obj) {
    obj.interactive = true;

    // 对象事件（站场图个体有可能用不上drag）
    obj.on("mousedown", e => {
      // 此处采用同个按下事件，只是添加一个选中对象
      // this._onMouseDown(e, obj);
    });

    obj.on("click", e => {
      e.stopPropagation();
      // 如果是画布拖动，则不触发点击事件
      if (!this.allowClick) {
        return;
      }
    });

    obj.on("rightclick", e => {
      console.log("按下右键");
    });
  }

  /**
   * 清除所有图形
   */
  clear() {
    graphics.clear();
  }

  /**
   * 销毁应用
   */
  destroy() {
    if (this.app) {
      this.app.destroy(true, {
        children: true,
        texture: true,
        baseTexture: true,
      });
      this.app = null;
    }
    graphics = null;
  }
}
