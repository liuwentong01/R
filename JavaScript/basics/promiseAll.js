// 等待所有任务成功；任意任务失败就立即失败，成功结果保持输入顺序。
Promise.myAll = function (promiseArr) {
  return new Promise((resolve, reject) => {
    const results = [];
    let remaining = 0;
    let index = 0;

    for (const item of promiseArr) {
      const currentIndex = index++;
      remaining++;

      // 普通值和 thenable 也可以作为输入；结果按输入顺序存放。
      Promise.resolve(item).then(
        (value) => {
          results[currentIndex] = value;
          if (--remaining === 0) resolve(results);
        },
        reject, // 任意一项失败，整个 Promise 立即失败。
      );
    }
  });
};

// 返回最先完成的任务结果，无论该任务成功还是失败。
Promise.myRace = function (promiseArr) {
  return new Promise((resolve, reject) => {
    for (const item of promiseArr) {
      // 第一个完成的结果决定最终状态，成功和失败都算。
      Promise.resolve(item).then(resolve, reject);
    }
    // 空输入没有结果，因此返回的 Promise 会一直处于 pending。
  });
};

// 等待所有任务结束，并返回每个任务的成功或失败状态。
Promise.myAllSettled = function (promiseArr) {
  return new Promise((resolve) => {
    const results = [];
    let remaining = 0;
    let index = 0;

    for (const item of promiseArr) {
      const currentIndex = index++;
      remaining++;

      // 无论成功还是失败，都记录状态；收齐后才返回结果。
      Promise.resolve(item).then(
        (value) => {
          results[currentIndex] = { status: "fulfilled", value };
          if (--remaining === 0) resolve(results);
        },
        (reason) => {
          results[currentIndex] = { status: "rejected", reason };
          if (--remaining === 0) resolve(results);
        },
      );
    }

    if (index === 0) resolve([]);
  });
};

// 返回第一个成功的结果；只有全部任务失败时才返回聚合错误。
Promise.myAny = function (promiseArr) {
  return new Promise((resolve, reject) => {
    const errors = [];
    let remaining = 0;
    let index = 0;

    for (const item of promiseArr) {
      const currentIndex = index++;
      remaining++;

      Promise.resolve(item).then(
        resolve, // 只要有一项成功，就立即返回该项的值。
        (reason) => {
          errors[currentIndex] = reason;
          if (--remaining === 0) {
            reject(new AggregateError(errors, "All promises were rejected"));
          }
        },
      );
    }

    // 空输入没有可能成功，也按“全部失败”处理。
    if (index === 0) {
      reject(new AggregateError([], "All promises were rejected"));
    }
  });
};

// 无论 Promise 成功还是失败都执行清理逻辑，并透传原来的结果。
Promise.prototype.myFinally = function (onFinally) {
  // 非函数参数与原生 finally 一样被忽略，原值或原错误直接透传。
  if (typeof onFinally !== "function") return this.then(onFinally, onFinally);

  return this.then(
    (value) => Promise.resolve(onFinally()).then(() => value),
    (reason) =>
      Promise.resolve(onFinally()).then(() => {
        throw reason;
      }),
  );
  // 清理函数返回 Promise 时先等待它；若清理失败，其错误会覆盖原结果。
};
