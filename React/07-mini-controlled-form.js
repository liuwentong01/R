/**
 * 受控表单 vs 非受控表单
 *
 * 用宿主 input 模型演示所有权：受控值由 React state 决定，非受控值由 DOM 决定。
 * 运行：node React/07-mini-controlled-form.js
 */

const assert = require("node:assert/strict");

function createHostInput(defaultValue = "") {
  return {
    value: String(defaultValue),
    userType(nextValue) {
      this.value = String(nextValue); // 浏览器先更新 DOM，再派发 change/input 事件。
    },
  };
}

function createControlledInput(initialValue = "") {
  const host = createHostInput();
  let stateValue = String(initialValue);

  function commit() {
    host.value = stateValue; // 每次 commit，prop value 都是最终真相。
  }

  function onChange(nextValue) {
    stateValue = String(nextValue);
    commit();
  }

  commit();
  return {
    host,
    onChange,
    setValue(nextValue) {
      stateValue = String(nextValue);
      commit();
    },
    get value() {
      return stateValue;
    },
  };
}

function createUncontrolledInput(defaultValue = "") {
  const host = createHostInput(defaultValue); // defaultValue 只参与挂载初值。
  return {
    ref: { current: host },
    rerenderWithDefaultValue() {
      // React 更新 defaultValue 不会覆盖用户已经输入的 current value。
    },
    reset() {
      host.value = String(defaultValue);
    },
  };
}

// ----------------------------------------------------------------------------
// 面试必答
// ----------------------------------------------------------------------------
//
// 【受控】
// - input/textarea/select 使用 value + onChange；checkbox/radio 使用 checked + onChange。
// - 用户输入 -> onChange -> setState -> render/commit -> prop 回写 DOM。
// - 适合实时校验、联动、格式化、动态禁用和统一提交；代价是每次变更会触发 React 更新，
//   大表单需拆分组件、降低 state 粒度，或使用专门表单库。
//
// 【非受控】
// - 用 defaultValue/defaultChecked 提供挂载初值，之后 DOM 保存当前值；提交时用 ref 或
//   FormData 读取。适合简单表单、渐进增强和减少输入过程中的 React 更新。
// - <input type="file"> 的文件选择由用户/浏览器管理，应通过 files/ref/FormData 读取，
//   不能像文本框那样用 value 控制。
//
// 【最常见坑】
// - 一个 input 生命周期内不要在受控和非受控之间切换。受控 value/checked 不应从明确值
//   变成 null/undefined；文本输入常用 value={value ?? ""} 保持受控。
// - 有 value 却没有 onChange/readOnly，用户输入会被下一次 commit 恢复，看起来“不能输”。
// - checkbox 应读取 event.target.checked，不是 value。
// - state 更新是快照；提交逻辑不要假设刚 setState 后局部变量已改变。
// - 原生 <form>、label、name、FormData 和浏览器校验仍有价值，不要为了 React 丢掉语义。
//
// React 19 另有 <form action={fn}>、useActionState、useFormStatus、useOptimistic，解决的是
// 提交流程、pending 与乐观反馈，不改变“输入值由 state 还是 DOM 持有”的基本区别。

function runDemo() {
  const controlled = createControlledInput("A");
  controlled.host.userType("B");
  assert.equal(controlled.host.value, "B", "浏览器先显示用户输入");
  controlled.onChange(controlled.host.value);
  assert.equal(controlled.value, "B");
  controlled.setValue("SERVER");
  assert.equal(controlled.host.value, "SERVER", "state 可主动覆盖 DOM");

  const uncontrolled = createUncontrolledInput("A");
  uncontrolled.ref.current.userType("B");
  uncontrolled.rerenderWithDefaultValue("C");
  assert.equal(uncontrolled.ref.current.value, "B", "defaultValue 更新不重置当前值");
  uncontrolled.reset();
  assert.equal(uncontrolled.ref.current.value, "A");

  console.log("Controlled/uncontrolled form tests passed");
}

if (require.main === module) runDemo();

module.exports = { createControlledInput, createUncontrolledInput };
