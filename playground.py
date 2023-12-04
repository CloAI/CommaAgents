#playground.py
import comma_agents
import comma_agents.flows as flows
from comma_agents.agents.external.litellm_agent import LiteLLMAgent
from comma_agents.agents import UserAgent

sequential_flow = flows.SequentialFlow([
    UserAgent(
        prompt="Can you write a poem for me?",
        agent_name="poem_requester",
    ),
    LiteLLMAgent(
        model_name="ollama/mistral",
        agent_name="poem_writer",
        system_prompt="You are a master poet. You will pick the best idea to write a beautiful poem about AI, and not ask for user feedback.",
    ),
    LiteLLMAgent(
        model_name="ollama/mistral",
        agent_name="poem_reviewer",
        system_prompt="You are a master poet reviewer. You will say if the poem is valid or actually a good poem.",
    )
])

# Run the flow
response = sequential_flow.run_flow()