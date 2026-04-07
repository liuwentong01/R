/**
 * 受控组件 vs 非受控组件 手写模拟
 *
 * ═══════════════════════════════════════════════════════
 *  为什么这是高频面试题？
 * ═══════════════════════════════════════════════════════
 *
 * React 表单题几乎都会问到：
 *   1. 什么是受控组件？
 *   2. 什么是非受控组件？
 *   3. 两者的优缺点和适用场景是什么？
 *
 * 本文件不用真实 DOM，而是用极简“输入框对象”模拟两种数据流。
 *
 * 运行方式：node React/mini-controlled-form.js
 */

// ── 模拟宿主 input ─────────────────────────────────────────────────────────

function createHostInput(initialValue = "") {
  return {
    value: initialValue,
    userType(nextValue) {
      this.value = nextValue;
      console.log(`  [host] 用户输入 -> "${nextValue}"`);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 一、受控组件：值由 React state 驱动
// ═══════════════════════════════════════════════════════════════════════════

function createControlledForm() {
  const hostInput = createHostInput("");

  const state = {
    username: "",
  };

  function render() {
    // 受控组件：每次 render，state 会把值“回填”给 DOM
    hostInput.value = state.username;
    console.log(`  [controlled] render -> input.value = "${hostInput.value}"`);
  }

  function setState(partial) {
    Object.assign(state, partial);
    render();
  }

  function onChange(nextValue) {
    console.log(`  [controlled] onChange -> setState("${nextValue}")`);
    setState({ username: nextValue });
  }

  function onSubmit() {
    if (!state.username.trim()) {
      console.log("  [controlled] submit 失败：用户名不能为空");
      return;
    }
    console.log(`  [controlled] submit 成功：username = "${state.username}"`);
  }

  function reset() {
    console.log("  [controlled] reset -> setState(\"\")");
    setState({ username: "" });
  }

  return {
    hostInput,
    render,
    onChange,
    onSubmit,
    reset,
    getState() {
      return { ...state };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 二、非受控组件：值保存在 DOM，自身通过 ref 读取
// ═══════════════════════════════════════════════════════════════════════════

function createUncontrolledForm() {
  const inputRef = {
    current: createHostInput(""),
  };

  function render() {
    console.log(`  [uncontrolled] render -> defaultValue = "${inputRef.current.value}"`);
  }

  function onSubmit() {
    const currentValue = inputRef.current.value;
    if (!currentValue.trim()) {
      console.log("  [uncontrolled] submit 失败：用户名不能为空");
      return;
    }
    console.log(`  [uncontrolled] submit 成功：username = "${currentValue}"`);
  }

  function reset() {
    inputRef.current.value = "";
    console.log("  [uncontrolled] reset -> 直接改 DOM value = \"\"");
  }

  return {
    inputRef,
    render,
    onSubmit,
    reset,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试 1：受控组件的数据流
// ═══════════════════════════════════════════════════════════════════════════

console.log("=== 受控组件 vs 非受控组件 ===\n");

console.log("【测试 1】受控组件");
const controlled = createControlledForm();
controlled.render();

controlled.hostInput.userType("alice");
console.log(`  [controlled] 此时 hostInput.value = "${controlled.hostInput.value}"（模拟浏览器先改 DOM）`);
controlled.onChange(controlled.hostInput.value);
console.log("  [controlled] state =", controlled.getState());
controlled.onSubmit();
controlled.reset();

// ═══════════════════════════════════════════════════════════════════════════
// 测试 2：非受控组件的数据流
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 2】非受控组件");
const uncontrolled = createUncontrolledForm();
uncontrolled.render();

uncontrolled.inputRef.current.userType("bob");
console.log(`  [uncontrolled] React state 不感知当前值，提交时再从 ref 读取`);
uncontrolled.onSubmit();
uncontrolled.reset();
uncontrolled.onSubmit();

// ═══════════════════════════════════════════════════════════════════════════
// 测试 3：受控组件更适合联动和校验
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n【测试 3】为什么复杂业务表单更偏向受控");
controlled.onChange("  ");
controlled.onSubmit();
controlled.onChange("charlie");
console.log(`  [controlled] 可以随时基于 state 做按钮禁用、联动展示、实时校验`);

console.log("\n\n=== 面试要点 ===");
console.log("1. 受控组件：表单值由 React state 驱动，value 和 onChange 成对出现");
console.log("2. 非受控组件：表单值保存在 DOM，通常通过 ref 在提交时读取");
console.log("3. 受控组件优点是可预测、易校验、易联动、易回显，更适合复杂业务表单");
console.log("4. 非受控组件更轻量，适合简单表单或 file input 这类天然偏 DOM 管理的场景");
console.log("5. 受控组件的数据流是：用户输入 -> onChange -> setState -> render -> value 回填 DOM");
console.log("6. 非受控组件的数据流是：用户输入直接改 DOM -> 提交时通过 ref 读取当前值");
