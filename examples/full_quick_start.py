from comma_agents.agents.external import LLaMaAgent
from comma_agents.prompts import PromptTemplate

zephyr_prompt_template = PromptTemplate("""<|system|>
{system_message}</s>
<|user|>
{user_message}</s>
<|assistant|>
{assistant_message}""",
parameters={
    "system_message": "You are a really cool AI! End all your statements with a hashtag. Be \"lit\" and use emojis a lot.",
})

# Creating an example agent
example_agent = LLaMaAgent(
    name="Example Agent",
    prompt_template=zephyr_prompt_template,
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
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