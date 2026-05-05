import{j as r}from"./jsx-runtime-BjG_zV1W.js";import{B as x,T as p}from"./parse-keypress-DxfFivvL.js";import{r as n}from"./index-C-D8K_XC.js";import{u as I}from"./use-input-Dlgi9-AW.js";import{u as E}from"./use-focus-DyHGIeWN.js";import{u as M}from"./use-box-metrics-DIVmjLHY.js";import{T as B}from"./TextAreaInput-DLKcg97H.js";import{u as W}from"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-stdout-BKjaryTg.js";import"./useMouse.utils-Bg5NRmlo.js";import"./useMouseWheelScroll-C98WjfFd.js";import"./MouseContext-CW2BFv0K.js";function k(){const e=W();return n.useMemo(()=>({container:{flexDirection:"column"},borderBox:{borderStyle:"double",borderColor:e.borders.color,borderBackgroundColor:e.colors.surface},strategyRow:{flexDirection:"row",justifyContent:"space-between"},strategyLabel:{color:e.colors.primary,bold:!0},hint:{color:e.colors.muted,dimColor:!0}}),[e])}const R=typeof process.stdin.setRawMode=="function";function z({strategies:e,onSubmit:o,id:i,width:a="100%",height:b=5,placeholder:f="Enter your prompt..."}){const[s,c]=n.useState(""),[y,S]=n.useState(0),t=e[y]??e[0];if(!t)throw new Error("ChatTextArea requires at least one strategy");const l=n.useCallback(C=>{t&&(c(""),o(t.value,C))},[t,o]),{isFocused:D}=E({id:i,isActive:R});I((C,j)=>{if(j.tab&&S(u=>(u+1)%e.length),j.ctrl&&C==="s"){const u=s.trim();u&&l(u)}},{isActive:D&&R});const w=n.useRef(null),{width:T}=M(w),A=typeof a=="number"?a:T>0?T:0;return r.jsx(x,{ref:w,width:a,flexDirection:"column",children:A>0?r.jsx(F,{inputValue:s,onInputChange:c,onSubmit:l,strategyLabel:t.label,strategyDescription:t.description,width:A,height:b,placeholder:f,id:i}):null})}function F(e){const{inputValue:o,onInputChange:i,onSubmit:a,strategyLabel:b,strategyDescription:f,width:s,height:c,placeholder:y,id:S}=e,t=k(),l=typeof s=="number"?Math.max(1,s-2):s;return r.jsxs(x,{...t.container,width:s,children:[r.jsx(x,{...t.borderBox,children:r.jsx(B,{value:o,onChange:i,width:l,height:c,placeholder:y,onSubmit:a,id:S})}),r.jsxs(x,{...t.strategyRow,children:[r.jsxs(p,{children:[r.jsx(p,{...t.strategyLabel,children:b}),r.jsxs(p,{...t.hint,children:[" — ",f]})]}),r.jsx(p,{...t.hint,children:"tab strategy · ctrl+s submit"})]})]})}const v=[{label:"Plan",value:"/strategies/plan.ts",description:"Draft a step-by-step plan"},{label:"Code",value:"/strategies/code.ts",description:"Implement code changes"},{label:"Research",value:"/strategies/research.ts",description:"Gather context and links"}],ee={title:"Components/ChatTextArea",component:z,args:{strategies:v,onSubmit:(e,o)=>{console.log("[ChatTextArea] submit",{path:e,text:o})}}},m={},d={args:{id:"chat-input",width:80,height:8,placeholder:"Ask the agent anything..."}},h={args:{strategies:[v[0]],height:6,placeholder:"Type your prompt and press Ctrl+S to submit"}},g={args:{strategies:[...v,{label:"Review",value:"/strategies/review.ts",description:"Audit changes"},{label:"Summarize",value:"/strategies/summarize.ts",description:"Condense long content"}],height:6}};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:"{}",...m.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    id: "chat-input",
    width: 80,
    height: 8,
    placeholder: "Ask the agent anything..."
  }
}`,...d.parameters?.docs?.source}}};h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    strategies: [strategies[0]!],
    height: 6,
    placeholder: "Type your prompt and press Ctrl+S to submit"
  }
}`,...h.parameters?.docs?.source}}};g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    strategies: [...strategies, {
      label: "Review",
      value: "/strategies/review.ts",
      description: "Audit changes"
    }, {
      label: "Summarize",
      value: "/strategies/summarize.ts",
      description: "Condense long content"
    }],
    height: 6
  }
}`,...g.parameters?.docs?.source}}};const te=["Default","FixedWidth","SingleStrategy","ManyStrategies"];export{m as Default,d as FixedWidth,g as ManyStrategies,h as SingleStrategy,te as __namedExportsOrder,ee as default};
