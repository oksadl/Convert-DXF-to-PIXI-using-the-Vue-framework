// 默认黑色背景
const CAD_COLORS = {
  // 基本颜色 (0-9)
  // 0: [0, 0, 0], // ByBlock (黑)
  1: [255, 0, 0], // 红
  2: [255, 255, 0], // 黄
  3: [0, 255, 0], // 绿
  4: [0, 255, 255], // 青
  5: [0, 0, 255], // 蓝
  6: [255, 0, 255], // 洋红
  7: [255, 255, 255], // 白
  8: [128, 128, 128], // 灰
  9: [192, 192, 192], // 亮灰

  // 标准色 (10-19)
  10: [255, 0, 0],
  11: [255, 127, 127],
  12: [165, 0, 0],
  13: [165, 82, 82],
  14: [127, 0, 0],
  15: [127, 63, 63],
  16: [76, 0, 0],
  17: [76, 38, 38],
  18: [38, 0, 0],
  19: [38, 19, 19],

  // 基本颜色
  250: [0, 0, 0],
  251: [101, 101, 101],
  252: [102, 102, 102],
  253: [153, 153, 153],
  254: [204, 204, 204],
  255: [255, 255, 255],
};

/**  填充索引 (20-99)  **/
// 先算出中间的值（50-59）, r==g以r为准, 再算出20-49的值
// 以50-59为分界线，镜像得到60-99
for (let i = 10; i <= 19; i++) {
  const nowColor = CAD_COLORS[i];
  const classify = i % 10;
  const center = 50;
  CAD_COLORS[center + classify] = [nowColor[0], nowColor[0], nowColor[2]];
  const step = Math.round((nowColor[0] - nowColor[1]) / (5 - 1));
  [10, 20, 30, 40].forEach((count) => {
    const stepColor = ((count - 10) / 10) * step;
    CAD_COLORS[count + classify] = [
      nowColor[0],
      nowColor[1] + stepColor,
      nowColor[2],
    ];
    CAD_COLORS[center * 2 - count + classify] = [
      nowColor[1] + stepColor,
      nowColor[0],
      nowColor[2],
    ];
  });
}

/**  填充索引 (100-179)  **/
// 先算出中间的值（130-139）, g==b以g为准, 再算出100-129的值
// 以130-139为分界线，镜像得到140-179
for (let i = 90; i <= 99; i++) {
  const nowColor = CAD_COLORS[i];
  const classify = i % 10;
  const center = 130;
  CAD_COLORS[center + classify] = [nowColor[0], nowColor[1], nowColor[1]];
  const step = Math.round((nowColor[1] - nowColor[2]) / (13 - 9));
  [90, 100, 110, 120].forEach((count) => {
    const stepColor = ((count - 90) / 10) * step;
    CAD_COLORS[count + classify] = [
      nowColor[0],
      nowColor[1],
      nowColor[2] + stepColor,
    ];
    CAD_COLORS[center * 2 - count + classify] = [
      nowColor[0],
      nowColor[2] + stepColor,
      nowColor[1],
    ];
  });
}

/**  填充索引 (180-249)  **/
// 注： 本来可以利用镜像算到259，但是最大到255，且250及以后是固定颜色，所以只算到249
// 先算出中间的值（210-219）, b==r以b为准, 再算出180-209的值
// 以210-219为分界线，镜像得到220-249
for (let i = 170; i <= 179; i++) {
  const nowColor = CAD_COLORS[i];
  const classify = i % 10;
  const center = 210;
  CAD_COLORS[center + classify] = [nowColor[2], nowColor[1], nowColor[2]];
  const step = Math.round((nowColor[2] - nowColor[0]) / (5 - 1));
  [180, 190, 200].forEach((count) => {
    const stepColor = ((count - 170) / 10) * step;
    CAD_COLORS[count + classify] = [
      nowColor[0] + stepColor,
      nowColor[1],
      nowColor[2],
    ];
    CAD_COLORS[center * 2 - count + classify] = [
      nowColor[2],
      nowColor[1],
      nowColor[0] + stepColor,
    ];
  });
}
// 特殊情况处理, 将109，119...249的30以上的数字替换为88
for (const key in CAD_COLORS) {
  if (parseInt(key) % 10 === 9 && parseInt(key) > 100) {
    for (let index = 0; index < CAD_COLORS[key].length; index++) {
      if (CAD_COLORS[key][index] > 30) {
        CAD_COLORS[key][index] = 88;
      }
    }
  }
  // 转换为0xffffff的格式
  let hex_color = CAD_COLORS[key]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  CAD_COLORS[key] = "0x" + hex_color;
}

export default CAD_COLORS;
