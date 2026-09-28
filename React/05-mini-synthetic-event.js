/**
 * React 合成事件与事件委托（面试精简版）
 *
 * 高频结论：
 * 1. SyntheticEvent 包装 nativeEvent，提供一致的事件接口；可通过
 *    event.nativeEvent 访问原生事件。
 * 2. React 16 主要委托到 document；React 17+ 大多数事件委托到每个 root 容器，
 *    方便多版本、多根和渐进升级。少数事件需要特殊监听，不能概括成“所有事件”。
 * 3. 分发时根据目标 DOM 对应的 Fiber 向上收集监听器：捕获阶段外→内，冒泡阶段内→外。
 * 4. React 17 已移除 Web 端事件池；异步读取事件通常不再需要 event.persist()。
 * 5. DOM 事件优先级会影响 React 更新 lane，但它不等于 Scheduler 包的五档优先级。
 *
 * 边界：这是可运行的教学模型，只模拟单 root 的两阶段分发；不实现事件插件、
 * portals、嵌套 roots、hydration 事件重放、批处理及完整浏览器兼容逻辑。
 * 运行：node React/05-mini-synthetic-event.js
 */

class SyntheticEvent {
  constructor(nativeEvent) {
    this.nativeEvent = nativeEvent;
    this.type = nativeEvent.type;
    this.target = nativeEvent.target;
    this.currentTarget = null;
    this.bubbles = Boolean(nativeEvent.bubbles);
    this.defaultPrevented = Boolean(
      nativeEvent.defaultPrevented || nativeEvent.returnValue === false,
    );
    this._propagationStopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
    this.nativeEvent.preventDefault?.();
    // 旧环境的兼容写法；现代浏览器主要使用 preventDefault()。
    if (!this.nativeEvent.preventDefault) this.nativeEvent.returnValue = false;
  }

  stopPropagation() {
    this._propagationStopped = true;
    this.nativeEvent.stopPropagation?.();
    if (!this.nativeEvent.stopPropagation) this.nativeEvent.cancelBubble = true;
  }

  isDefaultPrevented() {
    return this.defaultPrevented;
  }

  isPropagationStopped() {
    return this._propagationStopped;
  }

  // React 17+ 保留该 API 以兼容旧代码，但 Web 事件不再池化，所以它是空操作。
  persist() {}

  isPersistent() {
    return true;
  }
}

/**
 * 只保留与分发主线有关的 Host Fiber 字段。
 * stateNode 在真实 React DOM 中是 DOM 节点，currentTarget 在回调执行时指向它。
 */
function createHostFiber(name, props = {}, parent = null) {
  return {
    tag: "HostComponent",
    name,
    props,
    return: parent,
    stateNode: { nodeName: name },
  };
}

function collectTwoPhaseListeners(targetFiber, reactName) {
  const captureName = `${reactName}Capture`;
  const capture = [];
  const bubble = [];

  for (let fiber = targetFiber; fiber; fiber = fiber.return) {
    // 真实实现只从可承载 DOM 事件 props 的 HostComponent 收集。
    if (fiber.tag !== "HostComponent") continue;

    if (typeof fiber.props[captureName] === "function") {
      capture.unshift({ instance: fiber.stateNode, listener: fiber.props[captureName] });
    }
    if (typeof fiber.props[reactName] === "function") {
      bubble.push({ instance: fiber.stateNode, listener: fiber.props[reactName] });
    }
  }

  return { capture, bubble };
}

function processListenersInOrder(listeners, event) {
  for (const { instance, listener } of listeners) {
    if (event.isPropagationStopped()) break;
    event.currentTarget = instance;
    try {
      listener(event);
    } finally {
      // 与浏览器事件一样，currentTarget 只在处理器执行期间有意义。
      event.currentTarget = null;
    }
  }
}

/**
 * 真实 React 先由事件插件从原生事件“提取”一个或多个合成事件，再处理 dispatchQueue。
 * 这里让调用者直接给出 reactName，只展示收集与传播顺序。
 */
function dispatchEvent(targetFiber, nativeEvent, reactName) {
  const event = new SyntheticEvent(nativeEvent);
  const { capture, bubble } = collectTwoPhaseListeners(targetFiber, reactName);
  processListenersInOrder(capture, event);
  processListenersInOrder(bubble, event);
  return event;
}

// 事件优先级只是概念演示；真实 React DOM 的映射更完整且可能随版本变化。
const DiscreteEventPriority = "DiscreteEventPriority"; // click、keydown 等
const ContinuousEventPriority = "ContinuousEventPriority"; // mousemove、scroll 等
const DefaultEventPriority = "DefaultEventPriority";

function getEventPriority(nativeType) {
  if (["click", "keydown", "keyup", "input"].includes(nativeType)) {
    return DiscreteEventPriority;
  }
  if (["mousemove", "pointermove", "scroll", "wheel"].includes(nativeType)) {
    return ContinuousEventPriority;
  }
  return DefaultEventPriority;
}

// ---------------------------------------------------------------------------
// 可运行示例
// ---------------------------------------------------------------------------

const calls = [];
const root = createHostFiber("root", {
  onClickCapture: (event) => calls.push(`root capture @${event.currentTarget.nodeName}`),
  onClick: (event) => calls.push(`root bubble @${event.currentTarget.nodeName}`),
});
const panel = createHostFiber(
  "panel",
  {
    onClickCapture: (event) => calls.push(`panel capture @${event.currentTarget.nodeName}`),
    onClick: (event) => calls.push(`panel bubble @${event.currentTarget.nodeName}`),
  },
  root,
);
const button = createHostFiber(
  "button",
  { onClick: (event) => calls.push(`button bubble @${event.currentTarget.nodeName}`) },
  panel,
);

const nativeClick = {
  type: "click",
  target: button.stateNode,
  bubbles: true,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  stopPropagation() {
    this.cancelBubble = true;
  },
};

const clickEvent = dispatchEvent(button, nativeClick, "onClick");
console.log("=== 两阶段分发 ===");
console.log(calls.join("\n"));
console.log("回调结束后 currentTarget:", clickEvent.currentTarget); // null
console.log("click 优先级:", getEventPriority("click"));

calls.length = 0;
const stopButton = createHostFiber(
  "stop-button",
  {
    onClick: (event) => {
      calls.push("stop-button bubble");
      event.stopPropagation();
    },
  },
  panel,
);
dispatchEvent(
  stopButton,
  { type: "click", target: stopButton.stateNode, bubbles: true },
  "onClick",
);
console.log("\n=== stopPropagation ===");
console.log(calls.join("\n")); // 仍有祖先 capture；没有祖先 bubble

console.log("\n=== 易错边界 ===");
console.log("• onChange 不是简单等同于原生 input；ChangeEventPlugin 会按元素类型监听多种原生事件。");
console.log("• onFocus/onBlur 的冒泡语义会借助 focusin/focusout 等机制归一化。");
console.log("• React 18 createRoot 的自动批处理覆盖更多异步来源，不只是合成事件回调。");
console.log("• 原生与 React 监听器的先后取决于捕获/冒泡阶段、挂载节点和注册时机，不可一概而论。");
