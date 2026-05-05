import{A as p}from"./AgentMessage-EwEHXbkd.js";import"./jsx-runtime-BjG_zV1W.js";import"./parse-keypress-DxfFivvL.js";import"./_commonjsHelpers-BosuxZz1.js";import"./index-C-D8K_XC.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./BorderedPanel-Q96qOL9j.js";import"./defineTheme-DdZGqrht.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import"./MessageList.theme-SDjce97R.js";const T={title:"Components/MessageList/AgentMessage",component:p,args:{sender:"planner",fallbackText:"I'll start by listing the project files.",streaming:!1,segments:[{type:"text",text:"I'll start by listing the project files.",streaming:!1}]},parameters:{docs:{description:{component:"`AgentMessage` renders a single agent's message inside a bordered panel\nheaded by the agent's name. The body is composed of typed segments\n(text, tool-call, tool-result, thinking, mcp-call). When `streaming` is\ntrue, an in-flight cursor is appended to the latest streaming segment."}}}},e={},t={args:{sender:"responder",fallbackText:"Legacy message body without segments.",segments:void 0}},a={args:{sender:"builder",fallbackText:"Let me read the package manifest.",segments:[{type:"text",text:"Let me read the package manifest.",streaming:!1},{type:"tool-call",toolName:"fs.read",args:'{"path":"/repo/packages/tui/package.json"}'}]}},s={args:{sender:"builder",fallbackText:"Let me read the package manifest.",segments:[{type:"text",text:"Let me read the package manifest.",streaming:!1},{type:"tool-call",toolName:"fs.read",args:'{"path":"/repo/packages/tui/package.json"}'},{type:"tool-result",toolName:"fs.read",output:`{
  "name": "@comma-agents/tui",
  "version": "0.4.2"
}`},{type:"text",text:"Got it — TUI package at v0.4.2.",streaming:!1}]}},r={args:{sender:"planner",fallbackText:"We should refactor the message renderer.",segments:[{type:"thinking",id:"reasoning_7f3c",text:"The user wants per-segment rendering. I should check whether existing components already split by type, then propose a minimal change.",streaming:!1},{type:"text",text:"We should refactor the message renderer.",streaming:!1}]}},n={args:{sender:"builder",fallbackText:"Applying the patch now",streaming:!0,segments:[{type:"tool-call",toolName:"fs.write",args:'{"path":"/repo/packages/tui/src/components/MessageList/AgentMessage/AgentMessage.tsx"}'},{type:"text",text:"Applying the patch now",streaming:!0}]}},o={args:{sender:"researcher",fallbackText:"Querying remote MCP server.",segments:[{type:"mcp-call",serverName:"github",toolName:"search_repositories",args:'{"query":"ink react terminal","per_page":3}',output:"Found 3 results: ink, ink-table, ink-select-input."}]}};e.parameters={...e.parameters,docs:{...e.parameters?.docs,source:{originalSource:"{}",...e.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    sender: "responder",
    fallbackText: "Legacy message body without segments.",
    segments: undefined
  }
}`,...t.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    sender: "builder",
    fallbackText: "Let me read the package manifest.",
    segments: [{
      type: "text",
      text: "Let me read the package manifest.",
      streaming: false
    }, {
      type: "tool-call",
      toolName: "fs.read",
      args: '{"path":"/repo/packages/tui/package.json"}'
    }]
  }
}`,...a.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    sender: "builder",
    fallbackText: "Let me read the package manifest.",
    segments: [{
      type: "text",
      text: "Let me read the package manifest.",
      streaming: false
    }, {
      type: "tool-call",
      toolName: "fs.read",
      args: '{"path":"/repo/packages/tui/package.json"}'
    }, {
      type: "tool-result",
      toolName: "fs.read",
      output: '{\\n  "name": "@comma-agents/tui",\\n  "version": "0.4.2"\\n}'
    }, {
      type: "text",
      text: "Got it — TUI package at v0.4.2.",
      streaming: false
    }]
  }
}`,...s.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    sender: "planner",
    fallbackText: "We should refactor the message renderer.",
    segments: [{
      type: "thinking",
      id: "reasoning_7f3c",
      text: "The user wants per-segment rendering. I should check whether existing components already split by type, then propose a minimal change.",
      streaming: false
    }, {
      type: "text",
      text: "We should refactor the message renderer.",
      streaming: false
    }]
  }
}`,...r.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    sender: "builder",
    fallbackText: "Applying the patch now",
    streaming: true,
    segments: [{
      type: "tool-call",
      toolName: "fs.write",
      args: '{"path":"/repo/packages/tui/src/components/MessageList/AgentMessage/AgentMessage.tsx"}'
    }, {
      type: "text",
      text: "Applying the patch now",
      streaming: true
    }]
  }
}`,...n.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    sender: "researcher",
    fallbackText: "Querying remote MCP server.",
    segments: [{
      type: "mcp-call",
      serverName: "github",
      toolName: "search_repositories",
      args: '{"query":"ink react terminal","per_page":3}',
      output: "Found 3 results: ink, ink-table, ink-select-input."
    }]
  }
}`,...o.parameters?.docs?.source}}};const M=["TextOnly","FallbackText","WithToolCall","WithToolResult","WithThinking","Streaming","McpCall"];export{t as FallbackText,o as McpCall,n as Streaming,e as TextOnly,r as WithThinking,a as WithToolCall,s as WithToolResult,M as __namedExportsOrder,T as default};
