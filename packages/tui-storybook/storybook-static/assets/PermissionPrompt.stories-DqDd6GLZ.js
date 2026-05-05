import{j as e}from"./jsx-runtime-BjG_zV1W.js";import{B as n,T as r}from"./parse-keypress-DxfFivvL.js";import{r as w}from"./index-C-D8K_XC.js";import{u as j,B as i}from"./Button-BdKzwvGR.js";import{u as E}from"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-input-Dlgi9-AW.js";import"./use-focus-DyHGIeWN.js";import"./useMouseHover-DTQaVSsT.js";import"./MouseContext-CW2BFv0K.js";import"./useMouse.utils-Bg5NRmlo.js";import"./defineTheme-DdZGqrht.js";const y=typeof process.stdin.setRawMode=="function",t={allow:"permission-allow",allowSession:"permission-allow-session",deny:"permission-deny",denySession:"permission-deny-session"};function _(o){switch(o){case"fs.read":return"read";case"fs.write":return"write";case"fs.exec":return"execute"}}function R({request:o,onDecide:a}){const{agentName:d,toolName:p,operation:x,resource:g}=o,{focus:u}=j(),s=E(),f=p?`${d} (${p})`:d,h=_(x);return w.useEffect(()=>{y&&u(t.allow)},[u,o]),e.jsxs(n,{flexDirection:"column",borderStyle:"single",borderColor:s.colors.warning,paddingX:2,paddingY:1,children:[e.jsx(n,{marginBottom:1,children:e.jsx(r,{bold:!0,color:s.colors.warning,children:"⚠ Permission request"})}),e.jsxs(n,{flexDirection:"column",marginBottom:1,children:[e.jsxs(r,{children:[e.jsx(r,{bold:!0,children:f}),e.jsx(r,{color:s.colors.secondary,children:" wants to "}),e.jsx(r,{bold:!0,children:h}),e.jsx(r,{color:s.colors.secondary,children:":"})]}),e.jsx(r,{color:s.colors.primary,children:g})]}),e.jsx(n,{marginBottom:1,children:e.jsx(r,{color:s.colors.secondary,dimColor:!0,children:"─".repeat(40)})}),e.jsxs(n,{flexDirection:"row",gap:2,children:[e.jsx(i,{id:t.allow,label:"Allow once",variant:"primary",onPress:()=>a("allow")}),e.jsx(i,{id:t.allowSession,label:"Allow session",variant:"secondary",onPress:()=>a("allow-session")}),e.jsx(i,{id:t.deny,label:"Deny once",variant:"danger",onPress:()=>a("deny")}),e.jsx(i,{id:t.denySession,label:"Deny session",variant:"ghost",onPress:()=>a("deny-session")})]}),e.jsx(n,{marginTop:1,children:e.jsx(r,{dimColor:!0,color:s.colors.secondary,children:"Tab · ↵ to select  |  mouse click also works"})})]})}const P={permissionRequestId:"perm_01HZX9F8Q3K6V5",runId:"run_01HZX9F8AB1234",agentName:"coder",toolName:"edit_file",operation:"fs.write",resource:"/Users/sam/projects/comma/src/index.ts"},M={title:"Components/PermissionPrompt",component:R,args:{request:P,onDecide:o=>{console.log("[PermissionPrompt] decision:",o)}}},c={},l={args:{request:{permissionRequestId:"perm_03READ",runId:"run_03READ",agentName:"researcher",toolName:"read_file",operation:"fs.read",resource:"/Users/sam/.aws/credentials"}}},m={args:{request:{permissionRequestId:"perm_02EXEC",runId:"run_02EXEC",agentName:"shell-runner",operation:"fs.exec",resource:"git push origin main --force"}}};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:"{}",...c.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    request: {
      permissionRequestId: "perm_03READ",
      runId: "run_03READ",
      agentName: "researcher",
      toolName: "read_file",
      operation: "fs.read",
      resource: "/Users/sam/.aws/credentials"
    }
  }
}`,...l.parameters?.docs?.source}}};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    request: {
      permissionRequestId: "perm_02EXEC",
      runId: "run_02EXEC",
      agentName: "shell-runner",
      operation: "fs.exec",
      resource: "git push origin main --force"
    }
  }
}`,...m.parameters?.docs?.source}}};const W=["FsWrite","FsRead","FsExecNoTool"];export{m as FsExecNoTool,l as FsRead,c as FsWrite,W as __namedExportsOrder,M as default};
