/**
 * Mini MobX：细粒度依赖追踪
 *
 * 教学边界：实现 observable(object)、autorun、computed；省略数组方法、Map/Set、
 * action 事务、异步调度、错误隔离和 React observer。真实 MobX 6 还会根据类型使用
 * Proxy/属性描述符，并有 makeAutoObservable、action、flow 等完整语义。
 *
 * 运行：node React/17-mini-mobx.js
 */

const assert = require("node:assert/strict");

// WeakMap<rawObject, Map<propertyKey, Set<Reaction>>>
const dependencies = new WeakMap();
const proxyCache = new WeakMap();
const proxyToRaw = new WeakMap();
let activeReaction = null;
const reactionStack = [];

function cleanup(reaction) {
  for (const dep of reaction.deps) dep.delete(reaction);
  reaction.deps.clear();
}

class Reaction {
  constructor(effect, scheduler = null) {
    this.effect = effect;
    this.scheduler = scheduler;
    this.deps = new Set();
    this.running = false;
    this.disposed = false;
  }

  track() {
    if (this.disposed) return undefined;
    cleanup(this); // 分支可能变化，每次运行都重新收集依赖。
    this.running = true;
    reactionStack.push(this);
    activeReaction = this;
    try {
      return this.effect();
    } finally {
      reactionStack.pop();
      activeReaction = reactionStack.at(-1) || null;
      this.running = false;
    }
  }

  schedule() {
    if (this.disposed || this.running) return;
    if (this.scheduler) this.scheduler();
    else this.track();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cleanup(this);
  }
}

function track(target, key) {
  if (!activeReaction) return;
  let byKey = dependencies.get(target);
  if (!byKey) dependencies.set(target, (byKey = new Map()));
  let reactions = byKey.get(key);
  if (!reactions) byKey.set(key, (reactions = new Set()));

  if (!reactions.has(activeReaction)) {
    reactions.add(activeReaction);
    activeReaction.deps.add(reactions);
  }
}

function trigger(target, key) {
  const reactions = dependencies.get(target)?.get(key);
  if (!reactions) return;
  // 复制快照：Reaction 运行时会从 Set 删除并重新加入自己。
  [...reactions].forEach((reaction) => reaction.schedule());
}

function observable(value) {
  if (value === null || typeof value !== "object") return value;
  if (proxyToRaw.has(value)) return value;
  const cached = proxyCache.get(value);
  if (cached) return cached;

  const proxy = new Proxy(value, {
    get(target, key, receiver) {
      const result = Reflect.get(target, key, receiver);
      track(target, key);
      return observable(result); // 教学版深层代理；缓存保证同一对象身份稳定。
    },
    set(target, key, nextValue, receiver) {
      const previousValue = Reflect.get(target, key, receiver);
      const didSet = Reflect.set(target, key, nextValue, receiver);
      if (didSet && !Object.is(previousValue, nextValue)) trigger(target, key);
      return didSet;
    },
  });

  proxyCache.set(value, proxy);
  proxyToRaw.set(proxy, value);
  return proxy;
}

function autorun(effect) {
  if (typeof effect !== "function") throw new TypeError("effect 必须是函数");
  const reaction = new Reaction(effect);
  reaction.track(); // autorun 会立即执行一次。
  return () => reaction.dispose();
}

function computed(getter) {
  if (typeof getter !== "function") throw new TypeError("getter 必须是函数");
  const box = {};
  let dirty = true;
  let cachedValue;

  // computed 既是 observer（读取 observable），也是 observable（被 autorun 读取）。
  const derivation = new Reaction(getter, () => {
    if (dirty) return;
    dirty = true;
    trigger(box, "value");
  });

  return {
    get value() {
      track(box, "value");
      if (dirty) {
        cachedValue = derivation.track();
        dirty = false;
      }
      return cachedValue;
    },
  };
}

// ----------------------------------------------------------------------------
// 面试连接点：MobX 如何让 React 更新？
// ----------------------------------------------------------------------------
//
// mobx-react-lite 的 observer 会让组件 render 在 Reaction 中执行：render 读取到哪些
// observable 属性，就只订阅哪些属性；变化后安排该组件重渲染。它不是比较整棵 state，
// 也不要求手写 selector。computed 用于缓存派生数据，autorun/reaction 用于副作用。
//
// 真实 MobX 中 action 的重点是“状态修改边界 + 事务批处理”：一个 action 内多次修改通常
// 在结束后统一通知 reaction；严格模式还要求 observable 修改发生在 action 中。本教学版
// 同步立即触发，故不要据此推断真实 MobX 的批处理时机。
//
// 与 Redux 的高频对比：
// - Redux：显式 action/reducer、不可变快照、通常靠 selector 缩小订阅，数据流约束强。
// - MobX：可变风格 API、运行时自动追踪属性读取，样板少，但隐式依赖更需要团队规范。
// 两者都能正确管理大型应用，不应回答成简单的性能高低。

function runDemo() {
  const state = observable({
    useA: true,
    a: 1,
    b: 10,
    nested: { value: 2 },
  });

  assert.equal(state.nested, state.nested, "深层 proxy 应保持引用稳定");

  const seen = [];
  const dispose = autorun(() => {
    seen.push(state.useA ? state.a : state.b);
  });
  state.a = 2; // 依赖 a，触发。
  state.useA = false; // 重收集后依赖 b，不再依赖 a。
  state.a = 3;
  state.b = 11;
  dispose();
  state.b = 12;
  assert.deepEqual(seen, [1, 2, 10, 11]);

  let calculations = 0;
  const total = computed(() => {
    calculations++;
    return state.nested.value * 5;
  });
  assert.equal(total.value, 10);
  assert.equal(total.value, 10);
  assert.equal(calculations, 1, "依赖不变时 computed 应命中缓存");
  state.nested.value = 3;
  assert.equal(total.value, 15);
  assert.equal(calculations, 2);

  console.log("Mini MobX tests passed");
}

if (require.main === module) runDemo();

module.exports = { observable, autorun, computed };
