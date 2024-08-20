from comma_agents.hub.agents.cloai.llama_cpp import LLaMaAgent
from comma_agents.strategies.memory_strategy import MemoryStrategy
from comma_agents.prompts import PromptTemplate, ZephyrPromptTemplate, LLaMaPromptTemplate


memgpt_agent = MemoryStrategy(
    memory_processor_agent=LLaMaAgent(
    name="memory_processor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_templates=LLaMaPromptTemplate(),
    unload_on_completion=True
),
    question_extractor_agent=LLaMaAgent(
    name="question_extractor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_templates=LLaMaPromptTemplate(),
    unload_on_completion=True
),
    statement_extractor_agent=LLaMaAgent(
    name="statement_extractor_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_templates=LLaMaPromptTemplate(),
    unload_on_completion=True
),
    context_aggregator_agent=LLaMaAgent(
    name="context_aggregator_agent",
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/airoboros-mistral2.2-7B-GGUF/airoboros-mistral2.2-7b.Q5_K_M.gguf",
        "n_ctx": 2048,
    },
    prompt_templates=LLaMaPromptTemplate(),
    unload_on_completion=True
))

print(memgpt_agent.summary())