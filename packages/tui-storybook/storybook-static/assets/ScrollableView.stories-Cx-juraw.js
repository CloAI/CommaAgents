import{j as t}from"./jsx-runtime-BjG_zV1W.js";import{B as l,T as d}from"./parse-keypress-DxfFivvL.js";import"./index-C-D8K_XC.js";import{S as i}from"./ScrollableView-CqBnTDWc.js";import"./_commonjsHelpers-BosuxZz1.js";import"./empty-38otJL1P.js";import"./iframe-DdW_k2i2.js";import"./index-BmyE5rk0.js";import"./use-box-metrics-DIVmjLHY.js";import"./use-stdout-BKjaryTg.js";import"./useMouseWheelScroll-C98WjfFd.js";import"./MouseContext-CW2BFv0K.js";import"./useMouse.utils-Bg5NRmlo.js";import"./Scrollbar-Bb7C86Mx.js";import"./useTheme-Cgx5yjbn.js";import"./useTheme.context-BL1VLgZE.js";import"./defineTheme-DdZGqrht.js";const a=Array.from({length:50},(e,r)=>({id:`row-${r}`,text:`Row ${r+1} — example content`})),c=[{id:"a",text:"Single line row."},{id:"b",text:`Two line
row with newline.`},{id:"c",text:"Single line row."},{id:"d",text:`Three
line
row.`},{id:"e",text:"Single line row."},...Array.from({length:20},(e,r)=>({id:`extra-${r}`,text:`Filler row ${r+1}.`}))],K={title:"Components/ScrollableView",component:i,parameters:{docs:{description:{component:"`ScrollableView` is the lower-level scrolling primitive used by\n`ScrollableList` and `MessageList`. It owns no selection — only an\noffset and a mouse-wheel handler. `getRowHeight` must be deterministic."}}}},o={render:()=>t.jsx(l,{width:50,height:10,flexDirection:"column",borderStyle:"single",children:t.jsx(i,{items:a,getKey:e=>e.id,renderItem:e=>t.jsx(d,{children:e.text}),getRowHeight:()=>1})})},n={render:()=>t.jsx(l,{width:50,height:10,flexDirection:"column",borderStyle:"single",children:t.jsx(i,{items:a,getKey:e=>e.id,renderItem:e=>t.jsx(d,{children:e.text}),getRowHeight:()=>1,stickToBottom:!0})})},s={render:()=>t.jsx(l,{width:40,height:12,flexDirection:"column",borderStyle:"single",children:t.jsx(i,{items:c,getKey:e=>e.id,renderItem:e=>t.jsx(d,{children:e.text}),getRowHeight:e=>e.text.split(`
`).length})})},m={render:()=>t.jsx(l,{width:40,height:6,borderStyle:"single",children:t.jsx(i,{items:[],getKey:e=>e.id,renderItem:e=>t.jsx(d,{children:e.text}),emptyText:"Nothing here yet."})})};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  render: () => <Box width={50} height={10} flexDirection="column" borderStyle="single">
      <ScrollableView<Row> items={rows} getKey={item => item.id} renderItem={item => <Text>{item.text}</Text>} getRowHeight={() => 1} />
    </Box>
}`,...o.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <Box width={50} height={10} flexDirection="column" borderStyle="single">
      <ScrollableView<Row> items={rows} getKey={item => item.id} renderItem={item => <Text>{item.text}</Text>} getRowHeight={() => 1} stickToBottom />
    </Box>
}`,...n.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <Box width={40} height={12} flexDirection="column" borderStyle="single">
      <ScrollableView<Row> items={variableRows} getKey={item => item.id} renderItem={item => <Text>{item.text}</Text>} getRowHeight={item => item.text.split("\\n").length} />
    </Box>
}`,...s.parameters?.docs?.source}}};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <Box width={40} height={6} borderStyle="single">
      <ScrollableView<Row> items={[]} getKey={item => item.id} renderItem={item => <Text>{item.text}</Text>} emptyText="Nothing here yet." />
    </Box>
}`,...m.parameters?.docs?.source}}};const D=["FixedHeightRows","StickToBottom","VariableHeightRows","Empty"];export{m as Empty,o as FixedHeightRows,n as StickToBottom,s as VariableHeightRows,D as __namedExportsOrder,K as default};
