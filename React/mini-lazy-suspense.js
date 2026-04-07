/**
 * React.lazy + Suspense 手写模拟
 *
 * ═══════════════════════════════════════════════════════
 *  为什么这是高频面试题？
 * ═══════════════════════════════════════════════════════
 *
 * 这类题核心考 3 件事：
 *   1. React.lazy 如何把 import() 包装成一个特殊组件
 *   2. 为什么渲染时会 throw Promise
 *   3. Suspense 为什么能显示 fallback，并在 Promise resolve 后重渲染
 *
 * 本文件用一个极简模型演示这个流程。
 *
 * 运行方式：node React/mini-lazy-suspense.js
 */

const Uninitialized = -1;
const Pending = 0;
const Resolved = 1;
const Rejected = 2;

function lazy(importFn) {
  const payload = {
    _status: Uninitialized,
    _result: importFn,
  };

  return {
    $$typeof: Symbol("lazy"),
    _payload: payload,
    _init(payloadToInit) {
      if (payloadToInit._status === Uninitialized) {
        const promise = payloadToInit._result();
        payloadToInit._status = Pending;
        payloadToInit._result = promise;

        promise.then(
          (module) => {
            payloadToInit._status = Resolved;
            payloadToInit._result = module;
          },
          (error) => {
            payloadToInit._status = Rejected;
            payloadToInit._result = error;
          }
        );
      }

      if (payloadToInit._status === Resolved) {
        return payloadToInit._result.default;
      }

      if (payloadToInit._status === Rejected) {
        throw payloadToInit._result;
      }

      throw payloadToInit._result;
    },
  };
}

function renderElement(element) {
  if (typeof element === "string") {
    return element;
  }

  if (element && element.$$typeof && String(element.$$typeof).includes("lazy")) {
    const Component = element._init(element._payload);
    return renderElement(Component());
  }

  if (typeof element === "function") {
    return renderElement(element());
  }

  if (typeof element?.type === "function") {
    return renderElement(element.type(element.props || {}));
  }

  return String(element);
}

function createSuspenseBoundary(fallback, onRetry) {
  return {
    render(children) {
      try {
        return renderElement(children);
      } catch (thrownValue) {
        if (thrownValue && typeof thrownValue.then === "function") {
          thrownValue.then(() => {
            console.log("  [Suspense] Promise resolve，触发重试渲染");
            onRetry();
          });
          return fallback;
        }
        throw thrownValue;
      }
    },
  };
}

function fakeImport(name, delay) {
  return () =>
    new Promise((resolve) => {
      console.log(`  [import()] 开始异步加载 ${name}`);
      setTimeout(() => {
        console.log(`  [import()] ${name} 加载完成`);
        resolve({
          default: function LoadedComponent() {
            return `[${name}] 真实组件内容`;
          },
        });
      }, delay);
    });
}

console.log("=== React.lazy + Suspense 手写模拟 ===\n");

const LazyProfile = lazy(fakeImport("ProfileCard", 300));

let renderCount = 0;
let suspenseBoundary;

function renderApp() {
  renderCount++;
  console.log(`\n[render #${renderCount}] 开始渲染`);

  const output = suspenseBoundary.render(LazyProfile);
  console.log("  渲染结果 =>", output);
}

suspenseBoundary = createSuspenseBoundary("[fallback] Loading...", renderApp);

renderApp();

setTimeout(() => {
  console.log("\n【额外测试】模块已缓存后再次渲染");
  renderApp();

  console.log("\n=== 面试要点 ===");
  console.log("1. React.lazy 会把 import() 包装成一个带状态机的特殊组件对象");
  console.log("2. 首次渲染时模块还没加载完成，所以会 throw Promise");
  console.log("3. Suspense 通过 try/catch 捕获这个 Promise，并先渲染 fallback");
  console.log("4. Promise resolve 后，React 会重新渲染，此时 lazy 组件能返回真实组件");
  console.log("5. 这不是“真正暂停 JS”，而是利用 throw Promise 中断当前渲染流程");
  console.log("6. lazy 更常用于路由级或大组件级代码分割");
}, 700);
