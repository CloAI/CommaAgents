import os
from comma_agents.hub.agents.cloai.openai import OpenAIAPIAgent

agent = OpenAIAPIAgent("Open AI Agent", config={
    "model_name": "gpt-4",
})

print(agent.call("Hello, how are you?"))