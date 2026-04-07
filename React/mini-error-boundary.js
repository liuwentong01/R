/**
 * ErrorBoundary 手写模拟
 *
 * ═══════════════════════════════════════════════════════
 *  为什么这是高频面试题？
 * ═══════════════════════════════════════════════════════
 *
 * 面试里常问：
 *   1. ErrorBoundary 能捕获什么错误？
 *   2. getDerivedStateFromError 和 componentDidCatch 分别在什么阶段执行？
 *   3. 为什么事件回调和异步错误捕获不到？
 *
 * 本文件用一个极简渲染器模拟最近错误边界捕获异常的过程。
 *
 * 运行方式：node React/mini-error-boundary.js
 */

class ErrorBoundary {
  constructor(props) {
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    console.log("  [render阶段] getDerivedStateFromError 被调用");
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.log("  [commit阶段] componentDidCatch 被调用");
    console.log("  [log] 上报错误:", error.message);
    console.log("  [log] componentStack:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return `[FallbackUI] ${this.state.error.message}`;
    }
    return this.props.children;
  }
}

function createElement(type, props = {}) {
  return {
    type,
    props,
  };
}

function renderNode(node, boundaryStack = []) {
  if (typeof node === "string") return node;

  if (node.type === ErrorBoundary) {
    const boundaryInstance = new ErrorBoundary(node.props);
    const nextStack = [...boundaryStack, boundaryInstance];

    try {
      const child = boundaryInstance.render();
      return renderNode(child, nextStack);
    } catch (error) {
      const partialState = ErrorBoundary.getDerivedStateFromError(error);
      boundaryInstance.state = { ...boundaryInstance.state, ...partialState };

      const fallbackChild = boundaryInstance.render();
      boundaryInstance.componentDidCatch(error, {
        componentStack: "<BuggyWidget /> -> <ErrorBoundary />",
      });
      return renderNode(fallbackChild, boundaryStack);
    }
  }

  if (typeof node.type === "function") {
    try {
      return renderNode(node.type(node.props), boundaryStack);
    } catch (error) {
      const nearestBoundary = boundaryStack[boundaryStack.length - 1];

      if (!nearestBoundary) {
        throw error;
      }

      const partialState = ErrorBoundary.getDerivedStateFromError(error);
      nearestBoundary.state = { ...nearestBoundary.state, ...partialState };
      const fallbackChild = nearestBoundary.render();
      nearestBoundary.componentDidCatch(error, {
        componentStack: `<${node.type.name} /> -> <ErrorBoundary />`,
      });
      return renderNode(fallbackChild, boundaryStack.slice(0, -1));
    }
  }

  return String(node);
}

// ═══════════════════════════════════════════════════════════════════════════
// 示例组件
// ═══════════════════════════════════════════════════════════════════════════

function SafeWidget() {
  return "[SafeWidget] render success";
}

function BuggyWidget() {
  console.log("  [render] BuggyWidget 开始渲染");
  throw new Error("render 崩了");
}

function AsyncBuggyWidget() {
  console.log("  [render] AsyncBuggyWidget render success");
  setTimeout(() => {
    try {
      throw new Error("async 崩了");
    } catch (error) {
      console.log("  [async-task] 这里的错误不会经过 ErrorBoundary =>", error.message);
    }
  }, 0);
  return "[AsyncBuggyWidget] render success";
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试 1：正常渲染
// ═══════════════════════════════════════════════════════════════════════════

console.log("=== ErrorBoundary 手写模拟 ===\n");

console.log("【测试 1】正常子组件");
const safeTree = createElement(ErrorBoundary, {
  children: createElement(SafeWidget),
});
console.log("  渲染结果 =>", renderNode(safeTree));

// ═══════════════════════════════════════════════════════════════════════════
// 测试 2：render 错误被边界捕获
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 2】render 错误被最近 ErrorBoundary 捕获");
const buggyTree = createElement(ErrorBoundary, {
  children: createElement(BuggyWidget),
});
console.log("  渲染结果 =>", renderNode(buggyTree));

// ═══════════════════════════════════════════════════════════════════════════
// 测试 3：没有边界时会直接抛出
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 3】没有 ErrorBoundary");
try {
  console.log("  渲染结果 =>", renderNode(createElement(BuggyWidget)));
} catch (error) {
  console.log("  未捕获错误 =>", error.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试 4：事件/异步错误为什么捕获不到
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 4】异步错误不会被 ErrorBoundary 捕获（用 try/catch 模拟观察）");
const asyncTree = createElement(ErrorBoundary, {
  children: createElement(AsyncBuggyWidget),
});
console.log("  渲染结果 =>", renderNode(asyncTree));

setTimeout(() => {
  try {
    throw new Error("事件回调/异步任务里的错误不在 render/commit 调用栈内");
  } catch (error) {
    console.log("  [async] 需要开发者自己处理 =>", error.message);
  }

  console.log("\n=== 面试要点 ===");
  console.log("1. ErrorBoundary 主要捕获子组件树在 render / 生命周期 / commit 过程中的错误");
  console.log("2. getDerivedStateFromError 在 render 阶段运行，用于切换到降级 UI");
  console.log("3. componentDidCatch 在 commit 阶段运行，常用于错误上报");
  console.log("4. 捕获流程本质是：子树 throw error -> 向上找到最近 ErrorBoundary -> 渲染 fallback");
  console.log("5. 事件处理函数、setTimeout、Promise 等异步错误不在 React render/commit 流程中，ErrorBoundary 捕获不到");
  console.log("6. 截至现在，错误边界能力仍主要依赖 Class 组件");
}, 20);
