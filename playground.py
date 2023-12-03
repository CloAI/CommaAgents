import commaagents

# Create a new agent with lite llm
greeter = commaagents.LiteLLMAgent("ollama/mistral")
responder = commaagents.LiteLLMAgent("ollama/mistral")

sequential_flow = commaagents.SequentialFlow([greeter, responder])

# Run the flow
response = sequential_flow.run_flow(messages=[
    {
        'content': 'Hello, how are you?',
        "role": "user"
    }
])

# Print the response
print(response)