import os
from comma_agents.hub.agents.nateageek import openai_agent

agent = openai_agent.OpenAIAPIAgent("Open AI Agent", config={
    "model_name": "gpt-4",
})

print(agent.call("Hello, how are you?"))