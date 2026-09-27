let res = {};
var entry = { a: { b: { c: { dd: "abcdd" } }, d: { xx: "adxx" }, e: "ae" } }; // 要求转换成如下对象
var output = { "a.b.c.dd": "abcdd", "a.d.xx": "adxx", "a.e": "ae" };
function flat(obj, key) {
  for (let k in obj) {
    if (typeof obj[k] === "object") {
      flat(obj[k], key + "." + k);
    } else {
      res[key.slice(1) + "." + k] = obj[k];
    }
  }
}
// flat(entry, "");
// console.log(res);

var entry2 = { "a.b.c.dd": "abcdd", "a.d.xx": "adxx", "a.e": "ae" };
var output2 = { a: { b: { c: { dd: "abcdd" } }, d: { xx: "adxx" }, e: "ae" } }; // 要求转换成如下对象

function unflatten(obj) {
  const result = {};
  for (const path of Object.keys(obj)) {
    const keys = path.split(".");
    let curObj = result;
    // 前面的路径负责创建对象
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!Object.hasOwn(curObj, key)) {
        curObj[key] = {};
      }
      curObj = curObj[key];
    }
    // 最后一段路径负责赋值
    curObj[keys[keys.length - 1]] = obj[path];
  }

  return result;
}

unflatten(entry2);
