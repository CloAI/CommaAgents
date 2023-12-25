import comma_agents.hub.agents.nateageek as nateageek_agents

agent = nateageek_agents.openai_agent.openai_api_agent.OpenAIAPIAgent("Open AI Agent", config={
    "model_name": "gpt4",
})

print(agent.call("Hello, how are you?"))