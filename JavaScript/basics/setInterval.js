/**通过setTimeout来实现setTimeInterval */
function mySetInterval(fn, delay) {
  let timer;
  let active = true;

  function run() {
    timer = setTimeout(() => {
      fn();
      if (active) {
        run();
      }
    }, delay);
  }

  run();

  return () => {
    active = false;
    clearTimeout(timer);
  };
}

const stop = mySetInterval(() => console.log("执行"), 1000);
// 需要停止时
stop();

// ====
function myInterval(fn, delay) {
  let active = true,
    timer;

  let run = () => {
    timer = setTimeout(() => {
      fn();
      if (active) {
        run();
      }
    }, delay);
  };

  run();

  return () => {
    active = false;
    clearTimeout(timer);
  };
}

let acc = 0;
let s = myInterval(() => console.log(++acc), 500);
