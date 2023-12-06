#playground.py
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.agents.code_agent.code_agent import CodeAgent
from comma_agents.agents.code_agent.languages.python_code_agent_language_handler import CodeAgentLanguageHandlerPython
import comma_agents.flows as flows
from comma_agents.agents.external.litellm_agent import LiteLLMAgent
from comma_agents.agents import UserAgent


cycle_observer_flow = flows.SequentialFlow([
    UserAgent(
        prompt="Write a python function that will correctly print out the fibonacci sequence up to the nth term. However, you can pass in a step parameter that will step every n fib number.",
        agent_name="User",
    ),
    flows.CycleObserverFlow([
        CodeAgent(
            agent_name="Coding User",
            coding_agent=LiteLLMAgent(
                model_name="ollama/codellama:7b",
                agent_name="Senior Developer",
                system_prompt="You are a senior developer that is a master at python. Think critically about the task step by step, then write the function and make sure it is logically valid. Please provide the language used for each code block.",
                keep_historical_context = True
            ),
        )    
    ], observer_agent=LiteLLMAgent(
        model_name="ollama/codellama:7b",
        agent_name="Senior Developer Reviewer",
        system_prompt="""You are a senior developer reviewer that is a master at python. Think critically about the task step by step, then make sure the presented code is logically valid. If the code output is not correct, state the issue and provide a reason.""",
    ), cycles=3, flow_name="Fibonacci Sequence Function Generator Cycle")
])

# Run the flow
response = cycle_observer_flow.run_flow()