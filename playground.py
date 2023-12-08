#playground.py
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.agents.code_interpreter.code_interpreter import CodeInterpreter
import comma_agents.flows as flows
from comma_agents.agents.external.litellm_agent import LiteLLMAgent
from comma_agents.agents.external.llama_cpp_agent import LLaMaAgent
from comma_agents.agents import UserAgent

cycle_observer_flow = flows.SequentialFlow(flows=[
    UserAgent(
        name="User",
        prompt="Write a python function that will correctly print out the fibonacci sequence up to the nth term. However, you can pass in a step parameter that will step every n fib number.",
    ),
    flows.CycleObserverFlow(
        cycles=1, 
        flow_name="Fibonacci Sequence Function Generator Cycle",
        observer_agent = LiteLLMAgent(
            name="Senior Developer Reviewer",
            model_name="ollama/codellama:7b",
            system_prompt="""You are a senior developer reviewer that is a master at python. Think critically about the task step by step, then make sure the presented code is logically valid. If the code output is not correct, state the issue and provide a reason.""",
        ), 
        flows=[
            LiteLLMAgent(
                name="Senior Developer",
                model_name="ollama/codellama:7b",
                system_prompt="You are a senior developer that is a master at python. Think critically about the task step by step, then write the function and make sure it is logically valid. Please provide the language used for each code block.",
                keep_historical_context = True
            ),
            CodeInterpreter()
        ]
    ),
    LLaMaAgent(
        name="Technical Documentation Writer",
        system_prompt="You are a technical documenter, please use Markdown to describe the data in a detail way that technical and none technical people can understand.",
        llama_config={
            "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/zephyr-7B-beta-GGUF/zephyr-7b-beta.Q6_K.gguf",
        }
    )
])

# Run the flow
response = cycle_observer_flow.run_flow()