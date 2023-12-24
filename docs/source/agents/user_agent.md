# UserAgent: Enhancing User Interactions in Conversational AI

## Overview
`UserAgent` 🤖, a specialized variant of the `BaseAgent`, is crafted to simulate and elevate user interactions within conversational AI applications. It's designed for flexibility, capable of either using preset user inputs or dynamically prompting for user responses.

## Key Features
- **Simulating User Input** 💬: `UserAgent` can operate with predefined messages, mimicking user interactions. This feature is excellent for demonstrations or testing how an AI agent would engage with specific user inquiries.
- **Prompting for Real-Time Input** 🎤: Alternatively, `UserAgent` can actively seek user input during its operation, adding a layer of interactivity and enabling genuine conversation flows between the user and the AI agent.

## Basic Use Case: Interactive Customer Service Bot 🛒
Let's envision a customer service bot scenario:
1. **Predefined Queries for Demos** 🎭: For showcasing the bot's capabilities, you can configure `UserAgent` with pre-set customer questions. This allows the bot to demonstrate its ability to handle common customer interactions smoothly.
   
2. **Live Interaction with User Queries** 🌐: In a live setting, set `UserAgent` to prompt users for their questions. This feature enables real-time interactions, providing an interactive and efficient customer service experience.

## How It Works
- **Start with User Input** 💬: `UserAgent` initiates the flow by prompting for user input, setting the stage for a personalized conversation.
- **Flow of Agents** 🔄: Following `UserAgent`, each agent in the sequence processes the input further, adding layers to the dialogue.
- **End with Comprehensive Response** 🎉: The final agent in the sequence delivers a response that reflects the user's initial input, culminating in a well-rounded interaction.

## Example: Customer Query Handling Bot
```python
from comma_agents.agents import UserAgent, BaseAgent
from comma_agents.flows import SequentialFlow

# Subsequent agent for query processing
response_agent = BaseAgent(name="ResponseAgent")

# Create SequentialFlow with UserAgent
query_flow = SequentialFlow(
    flow_name="User Query",
    flows=[
        UserAgent(name="User Input", require_input=True),
        response_agent
    ]
)

# Execute the flow
response = query_flow.run_flow()
print(response)
```

## Use Case
This setup is ideal for a customer service bot that starts by asking the customer for their query and then processes it through different agents to provide a tailored response, enhancing customer engagement and satisfaction.

## Summing Up
`UserAgent` is a versatile and user-agent tool in the conversational AI. Whether used for scripted demonstrations or live, interactive experiences, it offers a solid foundation for building various user-engaged LLMs. 🌈👩‍💼🤖
