/**
 * Mini React Internals Demo
 * ============================================================================
 *
 * 目标
 * ----
 * 这不是 React 源码的逐行翻译，而是一个“结构尽量小、概念尽量正确”的教学模型。
 * 它用一份文件串起 React 最核心的更新闭环：
 *
 *   JSX / createElement
 *          ↓
 *   React Element（不可变的 UI 描述）
 *          ↓
 *   Fiber Tree（可中断、可保存状态的工作单元）
 *          ↓
 *   Render Phase：执行组件 + Reconcile / Diff
 *          ↓
 *   Effect Flag：PLACEMENT / UPDATE / MOVE / DELETION（教学命名）
 *          ↓
 *   Commit Phase：一次性修改真实 DOM
 *          ↓
 *   useState 触发下一轮更新
 *
 * 建议阅读顺序
 * ------------
 * 1. createElement：先理解“Element 只是普通对象”。
 * 2. render / performUnitOfWork：理解 Fiber 如何把递归拆成一个个工作单元。
 * 3. reconcileChildren：理解 key + type 如何决定组件身份。
 * 4. commitRoot / commitWork：理解 Render 与 Commit 为什么必须分开。
 * 5. useState：理解状态为什么存放在 Fiber 上，以及 Hook 为什么不能写在条件语句里。
 * 6. 文件末尾的示例：把完整流程再串一次。
 *
 * 重要边界
 * --------
 * - 只支持一个 root。
 * - 只支持函数组件、普通 DOM 节点和文本节点；函数组件可返回一个根节点、
 *   字符串/数字或空值，不能返回多个并列根节点。
 * - 不支持 Fragment、组件返回数组、Context、ref、class component、Suspense、Error Boundary。
 * - 不支持 useEffect / useLayoutEffect；副作用队列与清理流程留作后续专题。
 * - 实现了简化版 keyed diff，但不是 React 生产版本的完整协调器。
 * - useState 不实现自动批处理、Lane、transition、相同值 eager bailout 与 render-phase update。
 * - 事件直接绑定在 DOM 上；真实 React 通常使用合成事件与事件委托。
 * - 为方便学习，暴露了 flushSync()；它不是 react-dom/flushSync 的完整复刻。
 * - Render 遍历使用 Fiber 迭代执行；Commit 为缩短代码仍使用递归，不适合极深的树。
 * - 这里的 render(element, container) 是教学入口，不等同于已被 createRoot 取代的
 *   旧 ReactDOM.render；React 18/19 应使用 createRoot(container).render(element)。
 * - React 18/19 的开发模式 StrictMode 可能额外调用 render/effect，以发现不纯逻辑；
 *   本文件没有模拟该行为。
 *
 * 即使不运行本文件，也可以把它当作一张“React 更新链路地图”来阅读。
 */


// =============================================================================
// 0. 常量与全局工作状态
// =============================================================================

/**
 * 浏览器没有“文本标签”，文本最终由 document.createTextNode 创建。
 * 为了让文本和普通 Element 可以走同一套 Fiber / Diff 流程，先把字符串、数字
 * 包装成一种特殊 Element，type 就使用 TEXT_ELEMENT。
 */
const TEXT_ELEMENT = "TEXT_ELEMENT";

/**
 * Root Fiber 也不是用户写出来的组件，而是协调器内部的人造节点。
 * 它的 dom 指向用户传入的 container，例如 <div id="root">。
 */
const ROOT_ELEMENT = "ROOT_ELEMENT";

/**
 * effectTag 表示本轮 Render Phase 得出的结论。
 * Render 阶段只记录“将来要做什么”，不会立即改动页面上已经可见的 DOM。
 */
const PLACEMENT = "PLACEMENT"; // 新建 DOM，并插入父节点。
const UPDATE = "UPDATE";       // 复用 DOM，只更新属性或文本。
const MOVE = "MOVE";           // 复用 DOM，但需要调整兄弟顺序。
const DELETION = "DELETION";   // 旧 Fiber 在新树里消失，需要删除 DOM。

/** 下一个等待处理的 Fiber 工作单元。 */
let nextUnitOfWork = null;

/** 正在构建的新 Fiber 树，也常被称为 workInProgress tree。 */
let workInProgressRoot = null;

/** 已经提交到页面、代表当前 UI 的 Fiber 树，也就是 current tree。 */
let currentRoot = null;

/**
 * 被删除的 Fiber 不会出现在新树里，所以无法从新树的 child / sibling 链上找到。
 * 因此协调时必须把它们额外记录下来，等 Commit Phase 统一处理。
 */
let deletions = [];

/** 当前正在执行的函数组件 Fiber，供 useState 定位 Hook。 */
let currentlyRenderingFiber = null;

/** 当前函数组件执行到了第几个 Hook。 */
let hookIndex = 0;

/** 防止重复向宿主环境注册完全相同的调度回调。 */
let hostCallbackScheduled = false;


// =============================================================================
// 1. Element：UI 的不可变描述
// =============================================================================

/**
 * 把字符串或数字转成特殊的文本 Element。
 *
 * 注意 Element、Fiber、DOM 是三种完全不同的对象：
 *
 * - Element：用户“想要什么 UI”的描述，通常用完即丢。
 * - Fiber：React 为完成更新而维护的可变工作单元，还承载 Hook 状态。
 * - DOM：浏览器页面上真正存在的宿主节点。
 */
function createTextElement(value) {
  return {
    type: TEXT_ELEMENT,
    key: null,
    props: {
      nodeValue: String(value),
      children: [],
    },
  };
}

/**
 * React 允许 children 中出现数组、null、布尔值等内容。
 * 这个辅助函数把它们整理成协调器容易处理的一维 Element 数组：
 *
 * - 数组：递归展开，支持列表 map() 的结果。
 * - null / undefined / true / false：表示“不渲染任何内容”，直接忽略。
 * - string / number：包装为 TEXT_ELEMENT。特别注意数字 0 不能被丢掉。
 * - Element 对象：原样保留。
 */
function normalizeChildren(input, result = []) {
  for (const child of input) {
    if (Array.isArray(child)) {
      normalizeChildren(child, result);
      continue;
    }

    if (
      child === null ||
      child === undefined ||
      typeof child === "boolean"
    ) {
      continue;
    }

    if (typeof child === "string" || typeof child === "number") {
      result.push(createTextElement(child));
      continue;
    }

    result.push(child);
  }

  return result;
}

/**
 * createElement 是经典 JSX transform 的编译目标；现代 automatic runtime 通常调用
 * jsx/jsxs，但产物仍是 React Element 这类 UI 描述。本文件用 createElement 便于观察。
 *
 * 例如：
 *
 *   <button className="primary">+1</button>
 *
 * 会被编译器转换成大致如下的调用：
 *
 *   createElement("button", { className: "primary" }, "+1")
 *
 * 所以 JSX 并不是浏览器原生语法，它只是创建 Element 对象的一种便捷写法。
 */
function createElement(type, rawProps, ...rawChildren) {
  const inputProps = rawProps ?? {};

  if (inputProps.ref != null) {
    throw new Error(
      "本教学协调器未实现 ref；不要把 ref 当作普通 DOM 属性。",
    );
  }

  /**
   * key 是给协调器使用的“身份提示”，不是普通业务 prop：
   * - 它只需要在同一个父节点的兄弟之间唯一。
   * - 它不会被传给函数组件，也不会写到 DOM attribute 上。
   * - key=0 是合法值，因此不能用 key || null 来判断。
   */
  const key = inputProps.key == null ? null : String(inputProps.key);

  // 复制 props，避免修改调用者传进来的对象，同时显式移除保留字段 key/ref。
  const props = {};
  for (const propName of Object.keys(inputProps)) {
    if (propName !== "key" && propName !== "ref" && propName !== "children") {
      props[propName] = inputProps[propName];
    }
  }

  // 显式的 children 实参优先；同时兼容 createElement(C, { children: value })。
  // 为简化协调，本实现始终把 props.children 规范成数组；真实 React 的公开
  // props.children 可能是单值，也可能是数组，不应依赖它总是数组。
  const childInput =
    rawChildren.length > 0
      ? rawChildren
      : Object.prototype.hasOwnProperty.call(inputProps, "children")
        ? [inputProps.children]
        : [];
  props.children = normalizeChildren(childInput);

  return {
    type,
    key,
    props,
  };
}


// =============================================================================
// 2. 调度入口：从 Element 创建 Root Fiber
// =============================================================================

/**
 * render 只负责“发起”一次渲染，不直接递归生成整棵 DOM。
 *
 * alternate 指向上一轮的对应 Fiber。新旧 Fiber 有了连接，协调器才能比较：
 * - type / key 是否相同？
 * - 旧 DOM 能否复用？
 * - 旧 Hook 状态能否继承？
 */
function render(element, container) {
  if (!container) {
    throw new Error("MiniReact.render(element, container) 需要一个 DOM 容器。");
  }

  workInProgressRoot = createRootFiber(
    container,
    normalizeChildren([element]),
    currentRoot,
  );

  deletions = [];
  nextUnitOfWork = workInProgressRoot;
  requestHostWork();
}

/** 创建一棵 workInProgress 树的根 Fiber。 */
function createRootFiber(container, children, alternate) {
  return {
    type: ROOT_ELEMENT,
    key: null,
    props: { children },
    dom: container,
    parent: null,
    child: null,
    sibling: null,
    alternate: alternate && alternate.dom === container ? alternate : null,
    index: 0,
    effectTag: null,
    hooks: null,
  };
}

/**
 * 浏览器支持 requestIdleCallback 时，就在空闲片段里执行 Fiber 工作；否则用
 * setTimeout 提供一个很小的兼容调度器。
 *
 * Fiber 的关键价值之一，就是把原本“一口气递归到底”的工作拆成可暂停的小单元。
 * 生产版 React 使用自己的 Scheduler，并结合优先级和 Lane；这里仅演示“可让步”。
 */
const scheduleIdleCallback =
  typeof globalThis.requestIdleCallback === "function"
    ? globalThis.requestIdleCallback.bind(globalThis)
    : (callback) => {
        return globalThis.setTimeout(() => {
          const frameStart = Date.now();
          callback({
            didTimeout: false,
            timeRemaining() {
              // 给本轮工作一个约 5ms 的时间片。
              return Math.max(0, 5 - (Date.now() - frameStart));
            },
          });
        }, 0);
      };

/** 请求宿主环境安排一轮工作。 */
function requestHostWork() {
  if (hostCallbackScheduled) return;

  hostCallbackScheduled = true;
  scheduleIdleCallback(workLoop);
}

/**
 * 每个时间片内不断处理 Fiber，快没有空闲时间时主动让出主线程。
 *
 * 请特别区分两个条件：
 * - nextUnitOfWork 存在：Render Phase 还没完成，绝不能提交半棵树。
 * - nextUnitOfWork 不存在且 workInProgressRoot 存在：整棵新树已准备好，可以 Commit。
 */
function workLoop(deadline) {
  hostCallbackScheduled = false;

  while (nextUnitOfWork && deadline.timeRemaining() > 1) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }

  if (!nextUnitOfWork && workInProgressRoot) {
    commitRoot();
  }

  if (nextUnitOfWork) {
    requestHostWork();
  }
}

/**
 * 教学和测试时常希望立即完成所有工作，所以提供 flushSync。
 * 它跳过“主动让步”，但仍然严格保留 Render → Commit 两阶段。
 */
function flushSync() {
  while (nextUnitOfWork) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }

  if (workInProgressRoot) {
    commitRoot();
  }
}


// =============================================================================
// 3. Render Phase：把递归树遍历拆成 Fiber 工作单元
// =============================================================================

/**
 * 处理一个 Fiber 后，按“深度优先”的顺序返回下一个工作单元：
 *
 * 1. 优先进入 child。
 * 2. 没有 child 就寻找 sibling。
 * 3. sibling 也没有就不断返回 parent，直到找到某个祖先的 sibling。
 *
 * 因为“下一步去哪”被显式保存在 parent / child / sibling 指针里，遍历可以暂停，
 * 下个时间片直接从 nextUnitOfWork 恢复，不依赖不能暂停的 JavaScript 递归调用栈。
 */
function performUnitOfWork(fiber) {
  const isFunctionComponent = typeof fiber.type === "function";

  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  if (fiber.child) {
    return fiber.child;
  }

  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }

  return null;
}

/**
 * 函数组件本身没有 DOM。它的“工作”就是执行函数，取得下一层 Element。
 *
 * 每次执行组件前都把 Hook 游标重置为 0。useState 依靠调用顺序在新旧 Fiber 的
 * hooks 数组里找到对应项，这正是 Hook 不能放进条件分支的根本原因之一。
 */
function updateFunctionComponent(fiber) {
  currentlyRenderingFiber = fiber;
  hookIndex = 0;
  fiber.hooks = [];
  const previousHookCount = fiber.alternate?.hooks?.length ?? null;

  let returnedElement;
  try {
    returnedElement = fiber.type(fiber.props);
  } finally {
    // 组件执行结束后立刻清空，避免在组件外误调用 useState 时写入上一棵 Fiber。
    currentlyRenderingFiber = null;
  }

  if (previousHookCount !== null && hookIndex !== previousHookCount) {
    throw new Error(
      `Hook 调用数量从 ${previousHookCount} 变为 ${hookIndex}；` +
        "不要在条件、循环或提前 return 之后调用 Hook。",
    );
  }

  const children = normalizeChildren([returnedElement]);
  if (children.length > 1) {
    throw new Error(
      "教学版函数组件只能返回一个根 Element；多根节点需要 Fragment，本文件未实现。",
    );
  }

  reconcileChildren(fiber, children);
}

/**
 * Host Component 指 div、button 等宿主节点，也包括特殊的 TEXT_ELEMENT。
 *
 * Render Phase 可以创建“尚未挂到页面”的 DOM，但不能修改 current tree 对应的
 * 可见 DOM。只有 Commit Phase 才会把变化真正展示给用户。
 */
function updateHostComponent(fiber) {
  if (fiber.type !== ROOT_ELEMENT && !fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  reconcileChildren(fiber, fiber.props.children ?? []);
}

/** 创建一个尚未插入页面的 DOM，并设置初始属性。 */
function createDom(fiber) {
  const dom =
    fiber.type === TEXT_ELEMENT
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);
  return dom;
}


// =============================================================================
// 4. Reconcile / Diff：key + type 决定 Fiber 身份
// =============================================================================

/**
 * 给兄弟 Fiber 生成匹配标识：
 *
 * - 显式 key：按 key 匹配，项目移动后仍能找到旧 Fiber。
 * - 没有 key：退化为按 index / 位置匹配。
 *
 * key 只在同一父节点的兄弟集合里有意义，不需要全局唯一。
 */
function getSiblingIdentity(node, index) {
  return node.key !== null ? `key:${node.key}` : `index:${index}`;
}

/**
 * 协调同一个父 Fiber 下的新旧 children。
 *
 * 这个实现使用 Map 做一次线性扫描，核心规则是：
 *
 * 1. key 相同且 type 相同：复用旧 Fiber 的 DOM 和 Hook 状态。
 * 2. key 相同但 type 不同：旧节点删除，新节点创建。
 * 3. 找不到相同身份：创建新节点。
 * 4. 扫描结束仍未被匹配的旧节点：删除。
 *
 * React 的 O(n) Diff 是建立在两条启发式假设上的：
 * - 不同 type 往往产生不同子树。
 * - 开发者会用稳定 key 标识可以跨更新保留的兄弟节点。
 *
 * 它追求的是可预测且足够快，不保证得到理论上的全局最少 DOM 操作次数。
 */
function reconcileChildren(parentFiber, newElements) {
  const oldFiberMap = new Map();
  const seenNewKeys = new Set();

  // 先收集旧兄弟链。oldFiber.index 是它在上一轮兄弟列表中的位置。
  let oldFiber = parentFiber.alternate?.child ?? null;
  let oldIndex = 0;

  while (oldFiber) {
    const identity = getSiblingIdentity(oldFiber, oldIndex);
    oldFiberMap.set(identity, oldFiber);
    oldFiber = oldFiber.sibling;
    oldIndex += 1;
  }

  let previousNewFiber = null;
  let lastPlacedIndex = 0;

  newElements.forEach((element, newIndex) => {
    if (!element || typeof element !== "object") {
      throw new TypeError("children 必须是 Element、字符串、数字、数组或空值。");
    }

    if (element.key !== null) {
      if (seenNewKeys.has(element.key)) {
        throw new Error(`同一组兄弟节点中出现了重复 key：${element.key}`);
      }
      seenNewKeys.add(element.key);
    }

    const identity = getSiblingIdentity(element, newIndex);
    const matchedOldFiber = oldFiberMap.get(identity) ?? null;
    const canReuse =
      matchedOldFiber !== null && matchedOldFiber.type === element.type;

    let newFiber;

    if (canReuse) {
      /**
       * oldIndex < lastPlacedIndex 表示：
       * 前面已经遇到过一个在旧列表中更靠后的节点，因此当前旧节点必须移动。
       *
       * 例如旧顺序 [A, B, C]，新顺序 [C, A, B]：
       * - 先看到 C，lastPlacedIndex 变成 2。
       * - 再看到 A，旧 index=0 < 2，所以 A 标记 MOVE。
       * - 再看到 B，旧 index=1 < 2，所以 B 标记 MOVE。
       */
      const mustMove = matchedOldFiber.index < lastPlacedIndex;

      newFiber = {
        type: matchedOldFiber.type,
        key: element.key,
        props: element.props,
        dom: matchedOldFiber.dom,
        parent: parentFiber,
        child: null,
        sibling: null,
        alternate: matchedOldFiber,
        index: newIndex,
        effectTag: mustMove ? MOVE : UPDATE,
        hooks: null,
      };

      if (!mustMove) {
        lastPlacedIndex = matchedOldFiber.index;
      }

      oldFiberMap.delete(identity);
    } else {
      /**
       * identity 相同但 type 不同也不能复用。
       * 例如 <li key="a"> 变成 <button key="a"> 时，key 虽然相同，DOM 类型已变，
       * 仍然必须删除旧 li 并创建 button。
       */
      if (matchedOldFiber) {
        matchedOldFiber.effectTag = DELETION;
        deletions.push(matchedOldFiber);
        oldFiberMap.delete(identity);
      }

      newFiber = {
        type: element.type,
        key: element.key,
        props: element.props,
        dom: null,
        parent: parentFiber,
        child: null,
        sibling: null,
        alternate: null,
        index: newIndex,
        effectTag: PLACEMENT,
        hooks: null,
      };
    }

    if (newIndex === 0) {
      parentFiber.child = newFiber;
    } else {
      previousNewFiber.sibling = newFiber;
    }

    previousNewFiber = newFiber;
  });

  /**
   * Map 中剩余的旧 Fiber 都没有进入新树，需要删除。
   * 删除记录必须挂在额外的 deletions 数组上，因为它们不在新 child 链中。
   */
  for (const remainingOldFiber of oldFiberMap.values()) {
    remainingOldFiber.effectTag = DELETION;
    deletions.push(remainingOldFiber);
  }

  // 新 children 为空时，显式清空 child，避免意外保留旧指针。
  if (newElements.length === 0) {
    parentFiber.child = null;
  }
}


// =============================================================================
// 5. Commit Phase：把计算结果真正应用到 DOM
// =============================================================================

/**
 * 只有 Render Phase 完整结束后才会进入 Commit Phase。
 * 这样用户不会看到“只更新了一半”的页面，也让被打断的 Render 工作可以安全丢弃。
 *
 * 真实 React 的 Commit 还会区分 before-mutation、mutation、layout 等步骤，随后调度
 * passive effects（useEffect）。Commit 本身不会像并发 Render 那样按 Fiber 时间切片；
 * 本文件只模拟 DOM mutation。
 */
function commitRoot() {
  // 被删除节点不在新树里，先根据单独保存的列表处理。
  for (const fiber of deletions) {
    const domParent = findParentDom(fiber.parent);
    commitDeletion(fiber, domParent);
  }

  commitWork(workInProgressRoot.child, false);

  // 提交完成：workInProgress tree 正式成为 current tree。
  currentRoot = workInProgressRoot;
  workInProgressRoot = null;
  deletions = [];

  // 只有成功 Commit 后才能从共享队列移除已消费 action；被中断的 Render 不能丢更新。
  finalizeHookQueues(currentRoot);

  /**
   * 本教学实现每轮都会创建新的 Fiber 对象；清掉更早的 alternate 链，避免历史无限增长。
   * 真实 React 通常在 current 与 workInProgress 两棵树之间复用 Fiber 对象。
   */
  trimAlternateHistory(currentRoot);
}

/** 沿 parent 向上寻找最近的真实 DOM 父节点。函数组件 Fiber 没有 dom。 */
function findParentDom(fiber) {
  let parent = fiber;

  while (parent && !parent.dom) {
    parent = parent.parent;
  }

  return parent?.dom ?? null;
}

/**
 * 提交一棵新 Fiber 子树。
 *
 * inheritedMove 用来处理“被移动的是函数组件 Fiber”的情况：函数组件没有 DOM，
 * 但它对应的第一个 Host 子节点需要移动。移动父 DOM 会自然带走整棵 DOM 子树。
 */
function commitWork(fiber, inheritedMove) {
  if (!fiber) return;

  const domParent = findParentDom(fiber.parent);
  const shouldMove = inheritedMove || fiber.effectTag === MOVE;

  if (fiber.dom && domParent) {
    if (fiber.effectTag === PLACEMENT) {
      const before = getHostSibling(fiber, domParent);
      domParent.insertBefore(fiber.dom, before);
    } else if (shouldMove) {
      updateDom(fiber.dom, fiber.alternate?.props ?? {}, fiber.props);
      const before = getHostSibling(fiber, domParent);

      /**
       * insertBefore(existingNode, before) 会“移动”原节点，不会复制节点。
       * before 为 null 时等价于 appendChild。
       */
      domParent.insertBefore(fiber.dom, before);
    } else if (fiber.effectTag === UPDATE) {
      updateDom(fiber.dom, fiber.alternate?.props ?? {}, fiber.props);
    }
  }

  /**
   * 如果当前 Fiber 已有 DOM，那么移动它就已经带走整棵 DOM 子树，child 不再继承 MOVE。
   * 如果当前 Fiber 是无 DOM 的函数组件，则继续把 MOVE 传给它的 Host 后代。
   */
  const childInheritedMove = fiber.dom ? false : shouldMove;
  commitWork(fiber.child, childInheritedMove);

  // sibling 与当前 Fiber 同级，只继承调用者传来的移动状态。
  commitWork(fiber.sibling, inheritedMove);
}

/**
 * 为插入或移动操作寻找右侧最近的、已经在同一 DOM 父节点中的稳定 Host 节点。
 * 新建节点和待移动节点自身还不是可靠锚点，因此需要跳过它们。
 */
function getHostSibling(fiber, domParent) {
  let node = fiber;

  search: while (node) {
    while (!node.sibling) {
      node = node.parent;

      // 到达当前 Host Parent 就说明右边没有可用锚点，应插到末尾。
      if (!node || node.dom === domParent) {
        return null;
      }
    }

    node = node.sibling;

    while (node && !node.dom) {
      if (node.effectTag === PLACEMENT || node.effectTag === MOVE) {
        continue search;
      }

      if (!node.child) {
        continue search;
      }

      node = node.child;
    }

    if (
      node &&
      node.effectTag !== PLACEMENT &&
      node.effectTag !== MOVE &&
      node.dom?.parentNode === domParent
    ) {
      return node.dom;
    }
  }

  return null;
}

/**
 * 删除函数组件时不能直接 removeChild，因为函数组件没有 DOM。
 * 此时继续向下寻找它拥有的 Host 子节点；删除 Host 父节点会自然删除其 DOM 后代。
 */
function commitDeletion(fiber, domParent) {
  if (!fiber || !domParent) return;

  if (fiber.dom) {
    if (fiber.dom.parentNode === domParent) {
      domParent.removeChild(fiber.dom);
    }
    return;
  }

  let child = fiber.child;
  while (child) {
    commitDeletion(child, domParent);
    child = child.sibling;
  }
}

/** 只保留 current → alternate 这一代连接，防止教学实现形成无限历史链。 */
function trimAlternateHistory(fiber) {
  if (!fiber) return;

  if (fiber.alternate) {
    fiber.alternate.alternate = null;
  }

  trimAlternateHistory(fiber.child);
  trimAlternateHistory(fiber.sibling);
}

/**
 * useState 在 Render Phase 只记录“本轮读取了多少个 action”，不会立刻清空共享队列。
 * 等整棵树成功 Commit 后再删除对应 action，可避免一次尚未提交的 Render 被新工作取代时
 * 永久丢失状态更新。
 */
function finalizeHookQueues(fiber) {
  if (!fiber) return;

  for (const hook of fiber.hooks ?? []) {
    if (hook.processedActionCount > 0) {
      hook.queue.pending.splice(0, hook.processedActionCount);
      hook.processedActionCount = 0;
    }
  }

  finalizeHookQueues(fiber.child);
  finalizeHookQueues(fiber.sibling);
}


// =============================================================================
// 6. DOM 属性与事件更新
// =============================================================================

// 只把 on 后紧跟大写字母的字段当成事件，避免把 once、only 等普通 prop 误判。
const isEventProp = (name) => /^on[A-Z]/.test(name);
const isReservedProp = (name) => name === "children" || name === "key";

/**
 * 把 React 风格事件名转换为 addEventListener 所需的信息。
 * onClickCapture 会得到 { type: "click", capture: true }；
 * onDoubleClick 需要显式映射为浏览器原生事件名 dblclick。
 */
function parseEventProp(name) {
  const capture = name.endsWith("Capture");
  const reactEventName = name.slice(2, capture ? -"Capture".length : undefined);
  const specialEventNames = {
    DoubleClick: "dblclick",
  };

  return {
    type: specialEventNames[reactEventName] ?? reactEventName.toLowerCase(),
    capture,
  };
}

/**
 * 比较旧 props 与新 props，而不是无脑重设全部属性。
 * 更新顺序很重要：先移除旧事件，再添加新事件，避免一次点击触发两个 handler。
 */
function updateDom(dom, previousProps, nextProps) {
  // 1. 删除已经消失或引用发生变化的旧事件。
  for (const name of Object.keys(previousProps)) {
    if (!isEventProp(name)) continue;

    const eventChanged = previousProps[name] !== nextProps[name];
    if (eventChanged && typeof previousProps[name] === "function") {
      const event = parseEventProp(name);
      dom.removeEventListener(event.type, previousProps[name], event.capture);
    }
  }

  // 2. 删除新 props 中不存在的普通属性。
  for (const name of Object.keys(previousProps)) {
    if (isEventProp(name) || isReservedProp(name)) continue;

    if (!(name in nextProps)) {
      removeDomProperty(dom, name, previousProps[name]);
    }
  }

  // 3. 设置新增或变化的普通属性。
  for (const name of Object.keys(nextProps)) {
    if (isEventProp(name) || isReservedProp(name)) continue;

    if (previousProps[name] !== nextProps[name]) {
      setDomProperty(dom, name, previousProps[name], nextProps[name]);
    }
  }

  // 4. 最后添加新增或变化的事件。
  for (const name of Object.keys(nextProps)) {
    if (!isEventProp(name)) continue;

    const eventChanged = previousProps[name] !== nextProps[name];
    if (eventChanged && typeof nextProps[name] === "function") {
      const event = parseEventProp(name);
      dom.addEventListener(event.type, nextProps[name], event.capture);
    }
  }
}

/** 删除普通 DOM 属性。这里覆盖最常见场景，生产环境还需处理更多平台差异。 */
function removeDomProperty(dom, name, previousValue) {
  if (name === "style") {
    if (previousValue && typeof previousValue === "object") {
      for (const styleName of Object.keys(previousValue)) {
        if (styleName.startsWith("--")) {
          dom.style.removeProperty?.(styleName);
        } else {
          dom.style[styleName] = "";
        }
      }
    } else {
      dom.removeAttribute?.("style");
    }
    return;
  }

  const actualName =
    name === "className" ? "class" : name === "htmlFor" ? "for" : name;

  if (name in dom && !name.startsWith("data-") && !name.startsWith("aria-")) {
    // 布尔 property 适合恢复为 false，其他 property 使用空字符串。
    dom[name] = typeof dom[name] === "boolean" ? false : "";
  }

  dom.removeAttribute?.(actualName);
}

/** 设置普通 DOM 属性，并对 style / className / data-* / aria-* 做少量专门处理。 */
function setDomProperty(dom, name, previousValue, nextValue) {
  if (name === "style") {
    if (nextValue !== null && nextValue !== undefined && typeof nextValue !== "object") {
      throw new TypeError("教学版 style 只接受对象，例如 { color: 'red' }。");
    }

    if (nextValue === null || nextValue === undefined) {
      removeDomProperty(dom, name, previousValue);
      return;
    }

    if (previousValue && typeof previousValue !== "object") {
      dom.removeAttribute?.("style");
    }

    const oldStyle =
      previousValue && typeof previousValue === "object" ? previousValue : {};

    for (const styleName of Object.keys(oldStyle)) {
      if (!(styleName in nextValue)) {
        if (styleName.startsWith("--")) {
          dom.style.removeProperty?.(styleName);
        } else {
          dom.style[styleName] = "";
        }
      }
    }

    for (const styleName of Object.keys(nextValue)) {
      if (styleName.startsWith("--")) {
        dom.style.setProperty?.(styleName, nextValue[styleName]);
      } else {
        dom.style[styleName] = nextValue[styleName];
      }
    }
    return;
  }

  if (name.startsWith("data-") || name.startsWith("aria-")) {
    // 对 aria-* / data-* 而言，false 通常也是有意义的字符串值，只有空值才删除。
    if (nextValue === null || nextValue === undefined) {
      dom.removeAttribute(name);
    } else {
      dom.setAttribute(name, String(nextValue));
    }
    return;
  }

  if (nextValue === null || nextValue === undefined || nextValue === false) {
    removeDomProperty(dom, name, previousValue);
    return;
  }

  if (name === "className") {
    dom.setAttribute("class", nextValue);
    return;
  }

  // nodeValue、value、checked、disabled 等字段更适合通过 DOM property 设置。
  if (name in dom) {
    dom[name] = nextValue;
  } else {
    dom.setAttribute?.(name, String(nextValue));
  }
}


// =============================================================================
// 7. useState：状态保存在 Fiber 的 Hook 链上
// =============================================================================

/**
 * 一个极简 useState。
 *
 * 最关键的不是 API 长得像 React，而是理解这几件事：
 *
 * 1. state 不存在函数组件的局部变量里，而是存在该组件 Fiber 的 hook 上。
 * 2. 新 Fiber 通过 alternate 找到旧 Fiber，继承上一轮 state。
 * 3. Hook 没有名字作为索引；第几个调用对应 hooks 数组的第几个位置。
 * 4. setState 不直接修改 DOM，它把 action 放进队列，再从 root 发起新一轮更新。
 * 5. 每次 render 读取的是一次状态快照；函数式 action 会按入队顺序基于前一结果计算。
 *
 * 真实 React 18 createRoot 默认会对更多来源的更新自动批处理，并用 lane 表达更新
 * 优先级；这里只把 action 入共享队列并重新从 root 调度，不模拟真实批处理边界。
 */
function useState(initialState) {
  if (!currentlyRenderingFiber) {
    throw new Error("useState 只能在函数组件执行期间调用。");
  }

  const oldHook =
    currentlyRenderingFiber.alternate?.hooks?.[hookIndex] ?? null;

  /**
   * queue 对象会被新旧 Hook 共享，所以 dispatch 的身份可以保持稳定。
   * 即使业务代码保存了较早一轮拿到的 setState，它仍会写入同一个 pending 队列。
   */
  const queue = oldHook?.queue ?? {
    pending: [],
    dispatch: null,
  };

  const hook = {
    state: oldHook
      ? oldHook.state
      : typeof initialState === "function"
        ? initialState()
        : initialState,
    queue,
    // 本轮读取的 action 数量，成功 Commit 后才会真正从共享队列移除。
    processedActionCount: queue.pending.length,
  };

  /**
   * 依次回放上一轮尚未消费的更新。
   * action 可以是值，也可以是函数：setCount(count => count + 1)。
   * 函数式写法能基于队列中的最新 state 继续计算，避免闭包捕获旧值。
   */
  // 使用切片得到稳定快照；Render 期间若有新 action 入队，应留给下一轮处理。
  const pendingActions = queue.pending.slice(0, hook.processedActionCount);

  for (const action of pendingActions) {
    hook.state =
      typeof action === "function" ? action(hook.state) : action;
  }

  if (!queue.dispatch) {
    queue.dispatch = (action) => {
      if (currentlyRenderingFiber) {
        throw new Error(
          "教学版不支持在组件 Render 期间调用 setState；请在事件或异步回调中更新。",
        );
      }

      queue.pending.push(action);
      scheduleUpdateFromCurrentRoot();
    };
  }

  currentlyRenderingFiber.hooks.push(hook);
  hookIndex += 1;

  return [hook.state, queue.dispatch];
}

/** setState 最终仍然回到 root，构造新 workInProgress tree。 */
function scheduleUpdateFromCurrentRoot() {
  if (!currentRoot) {
    throw new Error("首次 render 提交完成前不能调用 setState。");
  }

  workInProgressRoot = createRootFiber(
    currentRoot.dom,
    currentRoot.props.children,
    currentRoot,
  );

  deletions = [];
  nextUnitOfWork = workInProgressRoot;
  requestHostWork();
}


// =============================================================================
// 8. 调试工具：把带环的 Fiber 转成适合阅读的普通对象
// =============================================================================

/** 函数 type 用函数名显示，Host type 直接显示标签名。 */
function formatFiberType(type) {
  if (type === TEXT_ELEMENT) return "#text";
  if (type === ROOT_ELEMENT) return "Root";
  if (typeof type === "function") return type.name || "AnonymousComponent";
  return String(type);
}

/**
 * Fiber 包含 parent / alternate，会形成环，不能直接 JSON.stringify。
 * inspectFiberTree 只挑选适合学习的字段，便于在控制台观察组件身份与 Hook 状态。
 */
function inspectFiberTree() {
  function visit(fiber) {
    if (!fiber) return null;

    const children = [];
    let child = fiber.child;

    while (child) {
      children.push(visit(child));
      child = child.sibling;
    }

    return {
      type: formatFiberType(fiber.type),
      key: fiber.key,
      index: fiber.index,
      effectTag: fiber.effectTag,
      hasDom: Boolean(fiber.dom),
      hookStates: fiber.hooks?.map((hook) => hook.state) ?? [],
      children,
    };
  }

  return visit(currentRoot);
}


// =============================================================================
// 9. 对外 API
// =============================================================================

const MiniReact = Object.freeze({
  createElement,
  render,
  flushSync,
  useState,
  inspectFiberTree,
});

// 方便直接在浏览器控制台中访问。模块化项目里也可以改成 export { MiniReact }。
globalThis.MiniReact = MiniReact;


// =============================================================================
// 10. 使用示例（默认不执行，仅用于把完整链路串起来）
// =============================================================================

/**
 * 下面故意不用 JSX，这样能直接看见 Element 是如何创建的。
 * 若想在浏览器中尝试，只需准备：
 *
 *   <div id="root"></div>
 *   <script src="01-mini-react-internals-demo.js"></script>
 *
 * 然后取消最下方三行调用的注释。
 */

const h = MiniReact.createElement;

function Counter(props) {
  const [count, setCount] = MiniReact.useState(0);

  return h(
    "button",
    {
      className: "counter",
      "data-name": props.name,
      onClick: () => setCount((value) => value + 1),
    },
    props.name,
    "：",
    count,
  );
}

function DemoApp() {
  const [reversed, setReversed] = MiniReact.useState(false);
  const names = reversed ? ["C", "B", "A"] : ["A", "B", "C"];

  return h(
    "main",
    { className: "demo" },
    h("h1", null, "Mini React Fiber Demo"),
    h(
      "button",
      { onClick: () => setReversed((value) => !value) },
      "反转列表",
    ),
    h(
      "section",
      null,
      names.map((name) =>
        /**
         * 稳定 key 让每个 Counter 的 Fiber 身份跟着 name 走：
         * - 点击 B，让 B 的内部 count 变为 1。
         * - 反转列表后，B 的状态仍然属于 B。
         *
         * 如果删掉 key，协调器会按 index 复用 Fiber，状态就会跟着“位置”走。
         */
        h(Counter, { key: name, name }),
      ),
    ),
  );
}

// const container = document.querySelector("#root");
// MiniReact.render(h(DemoApp, null), container);
// MiniReact.flushSync();


// =============================================================================
// 11. 一次点击背后发生了什么？
// =============================================================================

/**
 * 假设用户点击 Counter 的按钮：
 *
 * 1. onClick 执行 setCount(value => value + 1)。
 * 2. action 被压入当前 Counter Fiber 对应 hook.queue。
 * 3. scheduleUpdateFromCurrentRoot 创建新的 Root Fiber。
 * 4. Render Phase 从 Root 开始执行 DemoApp、Counter。
 * 5. Counter 调用 useState：通过 alternate 找到旧 Hook，回放 queue，得到新 count。
 * 6. reconcileChildren 比较新旧 Element：key 和 type 相同，所以 DOM 可以复用。
 * 7. 文本 Fiber 被标记 UPDATE，Render Phase 到这里仍未修改可见 DOM。
 * 8. 整棵树完成后进入 Commit Phase，updateDom 修改 Text.nodeValue。
 * 9. workInProgress tree 成为 current tree，页面显示新的数字。
 *
 * 这就是最值得记住的主干：
 *
 *   事件 → 更新队列 → 新 Element → 新 Fiber → Diff → Commit → 新 current tree
 */


// =============================================================================
// 12. 本实现与真实 React 的对应关系
// =============================================================================

/**
 * 本文件                         真实 React（概念对应，并非一一等价）
 * ---------------------------------------------------------------------------
 * createElement                 React.createElement / jsx / jsxs
 * workInProgressRoot            FiberRoot + HostRoot workInProgress
 * performUnitOfWork             beginWork + completeUnitOfWork
 * reconcileChildren             ChildReconciler / reconcileChildFibers
 * effectTag                     flags / subtreeFlags
 * PLACEMENT / MOVE              Placement flag（真实 React 不单设本文件的 MOVE 字符串）
 * commitRoot / commitWork       commitRoot / mutation phase
 * hook.queue                    Hook update queue
 * alternate                     current ↔ workInProgress 双缓冲关系
 * requestIdleCallback fallback  React Scheduler（真实实现更完整、与优先级系统结合）
 * DOM 上直接 addEventListener   React DOM 事件插件 + root 级委托（本文件未模拟）
 *
 * 继续深入源码时，建议牢牢记住这些分界线：
 *
 * 1. Element ≠ Fiber ≠ DOM。
 * 2. Render Phase 负责计算，Commit Phase 负责产生外部可见副作用。
 * 3. state 属于 Fiber 身份；兄弟节点中的 Fiber 身份主要由 key + type 决定。
 * 4. 可中断的是并发 Render，不是“所有 render”，Commit 也不会按 Fiber 时间切片。
 * 5. lane 表示 React 更新及其优先级集合；Scheduler priority 表示宿主任务紧迫度，
 *    二者会映射协作，但不是同一套枚举。
 * 6. Render 必须保持纯粹，因为并发渲染、Suspense 或开发模式 StrictMode 都可能让它
 *    被暂停、放弃或重新执行。
 * 7. key 只在同级兄弟间参与身份匹配，不会作为普通 prop 传给组件。
 */
