Promise.race = function (promises) {
  return new Promise((resolve, reject) => {
    let len = promises.length;
    if (len === 0) return;
    for (let i = 0; i < len; i++) {
      Promise.resolve(promise[i])
        .then((data) => {
          resolve(data);
          return;
        })
        .catch((err) => {
          reject(err);
          return;
        });
    }
  });
};

Promise.myRace = function (iterable) {
  return new Promise((resolve, reject) => {
    for (const item of iterable) {
      // 第一个完成的结果决定最终状态，成功和失败都算。
      Promise.resolve(item).then(resolve, reject);
    }
    // 空输入没有结果，因此返回的 Promise 会一直处于 pending。
  });
};
