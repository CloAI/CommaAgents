from comma_agents.agents.external import LLaMaAgent

# Creating an example agent
example_agent = LLaMaAgent(
    name="Example Agent",
    llama_config={
        "model_path": "{local_path}",
    }
)

# Let's see what our agent has to say!
example_agent.call("Hello! How are you doing today LLM?")

from comma_agents.agents import UserAgent
from comma_agents.flows import SequentialFlow

# Setting up a sequential flow
flow = SequentialFlow(
    flow_name="Example Flow",
    flows=[
        UserAgent(
            name="User",
            require_input=True
        ),
        example_agent
    ]
)

# Time to run our flow!
flow.run_flow()

from comma_agents.flows import InfiniteCycleFlow

# Creating a cycle flow for ongoing interactions
flow = InfiniteCycleFlow( # Changing from SequentialFlow to InfiniteCycleFlow
    flow_name="Example Flow",
    flows=[
        UserAgent(
            name="User",
            require_input=True
        ),
        example_agent
    ]
)

# Let the conversation roll!
flow.run_flow()