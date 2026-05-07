import * as PIXI from "pixi.js";

export class calcTools {
  /**
   * 计算两个对象的各个相同属性的运算结果，以a为准，返回新对象
   * 目前只考虑a为普通对象
   * @param {Object} a - 计算的基准，以a为准计算二者相同的元素
   * @param {Object, Number, String} b - 工具项，为对象时多余的元素不保留，为number时对所有项进行同一元素操作
   * @param {String} type - 计算方式
   */
  static calcObject(a, b, type) {
    let newObj = JSON.parse(JSON.stringify(a));
    const nArray = Object.keys(newObj);

    if (typeof b === "object") {
      for (let index = 0; index < nArray.length; index++) {
        const k = nArray[index];
        if (b[k]) {
          newObj[k] = calcTools.calc(a[k], b[k], type);
          if (newObj[k] === null) {
            delete newObj[k];
            index--;
            continue;
          }
        }
      }
    } else if (!isNaN(parseFloat(b))) {
      for (let index = 0; index < nArray.length; index++) {
        const k = nArray[index];
        newObj[k] = calcTools.calc(a[k], b, type);
        if (newObj[k] === null) {
          delete newObj[k];
          index--;
          continue;
        }
      }
    } else {
      // b为其他情况先做错误处理
      return null;
    }
    return newObj;
  }

  /**
   * 计算两个number的运算结果
   * @param {Number, String} s1
   * @param {Number, String} s2
   * @param {String} type  - 计算方式
   */
  static calc(s1, s2, type) {
    let number1 = parseFloat(s1);
    let number2 = parseFloat(s2);
    // 判断类型是否为Number
    if (isNaN(number1) || isNaN(number2)) {
      console.warn("计算类型不正确", s1, s2);
      return null;
    }
    let final = null;
    switch (type) {
      case "+": {
        final = number1 + number2;
        break;
      }
      case "-": {
        final = number1 - number2;
        break;
      }
      case "*": {
        final = number1 * number2;
        break;
      }
      case "/": {
        final = number1 / number2;
        break;
      }
      case "%": {
        final = number1 - Math.floor(number1 / number2) * number2;
        break;
      }
      default: {
        console.error("没有这个计算类型", type);
        final = null;
        break;
      }
    }
    return final;
  }

  /**
   * 计算三角形的外接圆，得圆心和半径
   * @param {Object} [point1= {x, y}]
   * @param {Object} [point2= {x, y}]
   * @param {Object} [point3= {x, y}]
   * @returns
   */
  static calculateCircumcircle(point1, point2, point3) {
    const x1 = point1.x;
    const y1 = point1.y;
    const x2 = point2.x;
    const y2 = point2.y;
    const x3 = point3.x;
    const y3 = point3.y;
    // 计算边的中点
    const mid1 = [(x1 + x2) / 2, (y1 + y2) / 2];
    const mid2 = [(x2 + x3) / 2, (y2 + y3) / 2];

    // 计算边的斜率
    let slope1, slope2;

    // 防止除以零的情况
    if (x2 !== x1) {
      slope1 = (y2 - y1) / (x2 - x1);
    } else {
      slope1 = Infinity; // 垂直线的斜率
    }

    if (x3 !== x2) {
      slope2 = (y3 - y2) / (x3 - x2);
    } else {
      slope2 = Infinity; // 垂直线的斜率
    }

    // 计算垂直平分线的斜率
    let slopePerpendicular1, slopePerpendicular2;

    if (slope1 === Infinity) {
      slopePerpendicular1 = 0; // 垂直线的垂直线是水平线
    } else if (slope1 === 0) {
      slopePerpendicular1 = Infinity; // 水平线的垂直线是垂直线
    } else {
      slopePerpendicular1 = -1 / slope1;
    }

    if (slope2 === Infinity) {
      slopePerpendicular2 = 0; // 垂直线的垂直线是水平线
    } else if (slope2 === 0) {
      slopePerpendicular2 = Infinity; // 水平线的垂直线是垂直线
    } else {
      slopePerpendicular2 = -1 / slope2;
    }

    // 计算垂直平分线的方程
    // 方程形式: y - y1 = m(x - x1)
    // 转换为标准形式: Ax + By + C = 0

    // 计算两条垂直平分线的交点（外心）
    // 使用 mid1 和 slopePerpendicular1 以及 mid2 和 slopePerpendicular2
    let A1, B1, C1, A2, B2, C2;

    if (slopePerpendicular1 === Infinity) {
      // 垂直线的方程: x = constant
      A1 = 1;
      B1 = 0;
      C1 = -mid1[0];
    } else {
      A1 = slopePerpendicular1;
      B1 = -1;
      C1 = -slopePerpendicular1 * mid1[0] + mid1[1];
    }

    if (slopePerpendicular2 === Infinity) {
      // 垂直线的方程: x = constant
      A2 = 1;
      B2 = 0;
      C2 = -mid2[0];
    } else {
      A2 = slopePerpendicular2;
      B2 = -1;
      C2 = -slopePerpendicular2 * mid2[0] + mid2[1];
    }

    // 解方程组
    const determinant = Math.abs(A1 * B2 - A2 * B1);
    let x0, y0;

    if (determinant !== 0) {
      x0 = (B2 * C1 - B1 * C2) / determinant;
      y0 = (A1 * C2 - A2 * C1) / determinant;
    } else {
      // 如果行列式为零，说明两线平行或重合
      // 这里假设输入的三个点不共线，因此这种情况不会发生
      throw new Error("The points are collinear, no circumcircle exists.");
    }

    // 计算外接圆半径
    const radius = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));

    return { center: { x: x0, y: y0 }, radius };
  }

  /**
   * 计算两条线段的交点
   * @param {Object} p1 线段1的起点 {x, y}
   * @param {Object} p2 线段1的终点 {x, y}
   * @param {Object} p3 线段2的起点 {x, y}
   * @param {Object} p4 线段2的终点 {x, y}
   * @returns {Object|null} 交点坐标 {x, y}，如果无交点则返回 null
   */
  static findLineIntersection(p1, p2, p3, p4) {
    const denominator =
      (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);

    // 如果分母为 0，说明两线段平行或共线
    if (denominator === 0) {
      return null;
    }

    // 计算参数 t 和 s
    const tNumerator =
      (p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x);
    const sNumerator =
      (p1.x - p3.x) * (p1.y - p2.y) - (p1.y - p3.y) * (p1.x - p2.x);
    const t = tNumerator / denominator;
    const s = sNumerator / denominator;

    // 检查 t 和 s 是否在 [0, 1] 范围内
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
      };
    }

    return null; // 无交点
  }

  /**
   * 计算两点和凸度对应的圆心、半径、起始弧度、终止弧度
   * @param {object} point1 - 起点坐标 {x, y}
   * @param {object} point2 - 终点坐标 {x, y}
   * @param {number} bulge - 凸度值
   * @returns {Object} { center: [x, y], radius: number, startAngle: number, endAngle: number }
   */
  static calculateArcFromBulge(point1, point2, bulge) {
    const x1 = point1.x,
      y1 = point1.y;
    const x2 = point2.x,
      y2 = point2.y;
    // 计算弦长
    const dx = x2 - x1;
    const dy = y2 - y1;
    const chord = Math.sqrt(dx * dx + dy * dy);

    // 计算半径
    const radius = (chord / (4 * Math.abs(bulge))) * (1 + bulge * bulge);

    // 计算弦的中点
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // 计算垂直方向向量（逆时针旋转90度）
    const perpX = -dy;
    const perpY = dx;

    // 归一化垂直向量
    const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
    const unitX = perpX / perpLength;
    const unitY = perpY / perpLength;

    // 计算弧高（sagitta）
    const sagitta = (bulge * chord) / 2;

    // 计算圆心坐标, 逆时针和顺时针圆心不一样
    const centerX =
      midX + (radius - sagitta) * unitX * (-bulge / Math.abs(bulge));
    const centerY =
      midY + (radius - sagitta) * unitY * (-bulge / Math.abs(bulge));

    // 计算起始弧度（startAngle）和终止弧度（endAngle）
    const angle1 = Math.atan2(y1 - centerY, x1 - centerX);
    const angle2 = Math.atan2(y2 - centerY, x2 - centerX);

    // 根据凸度方向调整角度
    let startAngle, endAngle;
    if (bulge > 0) {
      // 逆时针方向（bulge > 0）
      startAngle = angle1;
      endAngle = angle2;
      if (angle2 <= angle1) endAngle += 2 * Math.PI; // 确保跨越0度时正确
    } else {
      // 顺时针方向（bulge < 0）
      startAngle = angle2;
      endAngle = angle1;
      if (angle1 <= angle2) endAngle += 2 * Math.PI;
    }

    return {
      center: { x: centerX, y: centerY },
      radius: radius,
      startAngle: startAngle,
      endAngle: endAngle,
    };
  }

  /**
   * 建立hatch剖面线
   * @param {*} fillContainer
   * @param {object} fillParams
   */
  static createANSIFill(fillContainer, fillParams) {
    const fillGraphics = new PIXI.Graphics();

    // 设置线条样式
    fillGraphics.setStrokeStyle({
      color: fillParams.color,
      width: fillParams.lineWidth,
      alpha: fillParams.alpha,
    });

    let minX_t = Infinity;
    let minY_t = Infinity;
    let maxX_t = -Infinity;
    let maxY_t = -Infinity;

    // 遍历容器中的所有子元素
    fillContainer.children.forEach(child => {
      // 只处理 Graphic 对象（可根据需要调整）
      if (child instanceof PIXI.Graphics) {
        // 获取图形的边界
        const { minX, maxX, minY, maxY } = child.getBounds()
        // 更新最小最大值
        minX_t = Math.min(minX, minX_t);
        minY_t = Math.min(minY, minY_t);
        maxX_t = Math.max(maxX, maxX_t);
        maxY_t = Math.max(maxY, maxY_t);
      }
    });

    if (minX_t === Infinity) {
      console.error("错误的外围container");
      return;
    }

    // 计算对角线长度（确保覆盖整个边界框）
    const diagonalLength = Math.sqrt(
      Math.pow(maxX_t - minX_t, 2) + Math.pow(maxY_t - minY_t, 2)
    );

    // 生成斜线, 默认为逆时针旋转
    const angleRad = (fillParams.patternAngle * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // 从偏移位置开始
    let startX = minX_t + fillParams.offsetX;
    let startY = minY_t + fillParams.offsetY;

    // 生成足够多的线条覆盖整个区域
    for (let i = 0; i < (diagonalLength * 2) / fillParams.spacing; i++) {
      const centerX = startX + i * fillParams.spacing * cosA;
      const centerY = startY + i * fillParams.spacing * sinA;

      // 计算线条的起点（左下方）
      const x = centerX - diagonalLength * cosA;
      const y = centerY + diagonalLength * sinA; // y轴向下为正

      // 计算线条的终点（右上方）
      const endX = centerX + diagonalLength * cosA;
      const endY = centerY - diagonalLength * sinA;

      // 绘制线条
      fillGraphics.moveTo(x, y);
      fillGraphics.lineTo(endX, endY);
    }
    fillGraphics.closePath();
    fillGraphics.stroke();
    fillGraphics.mask = fillContainer;
    return fillGraphics;
  }
}
