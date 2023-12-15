import json
from typing import List, TypedDict, Union
from comma_agents.agents import BaseAgent
from comma_agents.flows.broadcast_flow import BroadcastFlow
from comma_agents.strategies import Strategy
from comma_agents.flows import BaseFlow, CycleObserverFlow, SequentialFlow

MEMORY_CONTEXT_EXTRACTOR_PROMPT = """
You are a Context Extractor:
- You are responsible for extracting the from CONTEXT provided.
- The name of the people is provided in the following format "NAME said,".
- You will extract questions.
- You will extract statements.
- You do NOT add details to the questions.
- You do NOT add details to the statements.
- You do NOT create new questions.
- You do NOT create new statements.
- If there are not questions then you will ONLY extract statements.
- If there are not statements then you will ONLY extract questions.
- If name is not provided, then assume NAME is NONE.

Steps:
1. You will determine the NAME of all the people in the context.
2. You will break down the input into sentences.
4. You simplify the questions or statements into concise key words ONLY.
5. You will CATEGORIZE questions.
6. You will CATEGORIZE statements.
7. You will respond ONLY a JSON object with keys:
  - "person": name of who said the statement or question.
  - "questions": list of simplified extracted questions.
  - "statements": list of simplified extracted statements.
"""

MEMORY_QUESTION_PROMPT = """
You are a Question Extractor:
- Given the list of current memory buckets you will choose the best "memory_bucket" based on the question.
- The name of the person is provided and should be used to search the "memory_bucket".
- If no memory bucket is found, then you respond "none".
- Return JSON object with keys:
  - "memory_bucket": "memory_buckets" or "none" if none are found.

Person: "{person}"
Current "memory_buckets" are: [{buckets}, "none"]
Current Question: [{question}]
"""

MEMORY_STATEMENT_PROMPT = """
You are a Statement Processor:
- The name of the person is provided and should be used to search the "memory_bucket".
- Given the list of current memory buckets, choose the best "memory_bucket" insert keywords and summaries.
- If no memory bucket is found, then you respond with a generated snake-case key base on the statement.
- Return JSON object with keys:
  - "memory_bucket": "memory_bucket" name or generated snake-case key base on the statement.
  - "data": extracted keywords/summaries statement to store in memory bucket.

Person: "{person}"
Current "memory_buckets" are: [{buckets}]
Current Statement: [{statement}]
"""

class MemoryStrategy(Strategy):
    class MemoryStrategyParams(TypedDict, total=True):
        memory_processor_agent: BaseAgent
        question_extractor_agent: BaseAgent
        statement_extractor_agent: BaseAgent
        context_aggregator_agent: BaseAgent

    def __init__(
        self,
        strategy_params: MemoryStrategyParams,
    ):

      self.local_memory = {}
      super().__init__(strategy_name="Memory Strategy", strategy_params=strategy_params)
    
    def _defined_strategy(self, strategy_params: MemoryStrategyParams) -> Union[List[BaseFlow], BaseFlow]:
      # Question Extractor Overrides
      strategy_params["question_extractor_agent"].hooks["alter_initial_prompt"].append(self.extract_and_format_questions)
      strategy_params['question_extractor_agent'].hooks["alter_call_prompt"].append(self.extract_and_format_questions)
      strategy_params['question_extractor_agent'].hooks["alter_response"].append(self.get_memory_bucket_details_from_response)

      strategy_params['statement_extractor_agent'].hooks["alter_initial_prompt"].append(self.extract_and_format_statements)
      strategy_params['statement_extractor_agent'].hooks["alter_call_prompt"].append(self.extract_and_format_statements)

      strategy_params['statement_extractor_agent'].hooks["after_call"].append(self.add_to_memory_bucket)
      strategy_params['statement_extractor_agent'].hooks["after_initial_call"].append(self.add_to_memory_bucket)

      strategy_params['statement_extractor_agent'].hooks["alter_response"].append(lambda x: "")

      strategy_params['memory_processor_agent'].system_prompt = MEMORY_CONTEXT_EXTRACTOR_PROMPT
      strategy_params['context_aggregator_agent'].system_prompt = "Using the data provided come up with some simple phrases. Unless it is stated to say \"No context provided.\" then say \"No context provided.\""

      strategy_params['context_aggregator_agent'].hooks["alter_initial_prompt"].append(self.no_data_found)
      strategy_params['context_aggregator_agent'].hooks["alter_call_prompt"].append(self.no_data_found)

      strategy_params['context_aggregator_agent'].hooks["alter_response"].append(self.if_no_context_found)

      return SequentialFlow(
        flows=[
          strategy_params["memory_processor_agent"],
          BroadcastFlow(
            flows=[
              strategy_params["question_extractor_agent"],
              strategy_params["statement_extractor_agent"]
            ]
          ),
          strategy_params["context_aggregator_agent"]
        ])


    def extract_and_format_questions(self, prompt: str = ""):
      try:
        data = json.loads(prompt)
        if len(data["questions"]) == 0:
          return "NO QUESTIONS FOUND REPLY NOTHING"
        new_prompt = MEMORY_QUESTION_PROMPT.format(
          buckets=", ".join(self.get_memory_buckets()),
          question=", ".join(['"{}"'.format(key) for key in data["questions"]]),
          person=data["person"]
        )
        return new_prompt # POC: Just return the first question to query
      except:
        return "NO QUESTIONS FOUND REPLY NOTHING"
      
    def extract_and_format_statements(self, prompt: str = ""):
      try:
        data = json.loads(prompt)
        if len(data["statements"]) == 0:
          return "NO STATEMENTS FOUND REPLY NOTHING"
        new_prompt = MEMORY_STATEMENT_PROMPT.format(
          buckets=", ".join(self.get_memory_buckets()),
          statement=", ".join(['"{}"'.format(key) for key in data["statements"]]),
          person=data["person"]
        )
        return new_prompt # POC: Just return the first statement to update
      except:
        return "NO STATEMENTS FOUND"
      
    def get_memory_buckets(self):
      return ['"{}"'.format(key) for key in self.local_memory.keys()]

    def get_memory_bucket(self, memory_bucket: str = ""):
      if "none" in memory_bucket.lower():
        return "NO MEMORY FOUND REPLY NOTHING"
      try:
        return str(self.local_memory[memory_bucket.lower()]) # support array of buckets
      except:
        return "NO MEMORY FOUND REPLY NOTHING"

    def add_to_memory_bucket(self, response: str = ""):
      try:
        data = json.loads(response)
        self.local_memory[data["memory_bucket"].lower()] = data["data"]
      except:
        pass
    
    def get_memory_bucket_details_from_response(self, response: str = ""):
      try:
        data = json.loads(response)
        return self.get_memory_bucket(memory_bucket=data["memory_bucket"].lower())
      except:
        return "NO MEMORY FOUND REPLY NOTHING"
      
    def no_data_found(self, response: str = ""):
      if "NO MEMORY FOUND REPLY" in response:
        return "No context provided."
      else:
        return response

    def if_no_context_found(self, response: str = ""):
      if "No context" in response:
        return ""
      else:
        return response