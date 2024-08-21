import os

import mlx.core as mx
import random

from comma_agents.code_interpreters.code_interpreter_language_handler import CodeInterpreterLanguageHandler
print(os.getcwd())

import comma_agents.flows as flows
from comma_agents.hub.agents.cloai.llama_cpp import LLaMaAgent
from comma_agents.hub.agents.cloai.mlx import MLXAgent
from comma_agents.agents import UserAgent
from comma_agents.code_interpreters.code_interpreter import CodeInterpreter
from comma_agents.code_interpreters.languages import PythonCodeInterpreterLanguageHandler, ShCodeAgentLanguageHandler
from comma_agents.prompts import Llama31PromptTemplate, ZephyrPromptTemplate

mx.random.seed(42)
random.seed(42)

cycle_observer_flow = flows.InfiniteCycleFlow(flows=[
    UserAgent(
        name="User",
        require_input=False,
        user_message="Write a program that prints \"hello world\""
    ),
    MLXAgent(
        name="Programming Expert",
        prompt_template=Llama31PromptTemplate(
            parameters={
                "system_message": "You are a coding expert, write code, and mark the language used, only write python"
            }
        ),
        config={
            "model_path": "mlx-community/Meta-Llama-3.1-8B-Instruct-8bit",
            "max_tokens": 256,
            "temp": 0.0,
            "seed": 42
        },
        unload_on_completion=True,
        interpret_code=True,
        code_interpreter=CodeInterpreter(
            supported_languages={
                'python': PythonCodeInterpreterLanguageHandler(),
                'sh': ShCodeAgentLanguageHandler(),
                'bash': CodeInterpreterLanguageHandler(
                    language="bash",
                    interpreter_path="/bin/bash",
                )
            }
        )
    ),
    MLXAgent(
        name="Programming Expert",
        prompt_template = Llama31PromptTemplate(
            parameters={
                "system_message": "You are a coding reviewer, given the code provided, mark the language used, and write a test case"
            }    
        ),
        config={
            "model_path": "mlx-community/Meta-Llama-3.1-8B-Instruct-8bit",
            "max_tokens": 256,
            "temp": 0.0,
            "seed": 42
        },
        unload_on_completion=True,
        interpret_code=True,
        code_interpreter=CodeInterpreter(
            supported_languages={
                'python': PythonCodeInterpreterLanguageHandler(),
                'sh': ShCodeAgentLanguageHandler(),
                'bash': CodeInterpreterLanguageHandler(
                    language="bash",
                    interpreter_path="/bin/bash",
                )
            }
        )
    ),
    MLXAgent(
        name="Programming Expert",
        prompt_template = Llama31PromptTemplate(
            parameters={
                "system_message": "You are a coding reviewer reviewer, given the code provided and the test, confirm the code works"
            }    
        ),
        config={
            "model_path": "mlx-community/Meta-Llama-3.1-8B-Instruct-8bit",
            "max_tokens": 256,
            "temp": 0.0,
            "seed": 42
        },
        unload_on_completion=True,
    ),
])

# Run the flow
response = cycle_observer_flow.run_flow()