Please refer to the CREDITS.md for proper credits on the MemGPT idea.

# Overview

Current strategy:
- Create a Context Extractor Agent
    This agent will determine base on the prompt information what details should be updated in the memory and what details should be queried. This ideally will simplify the users input into digestible units for the two memory agents
- Create a Query Agent on Extracted Details
    This agent will extract the required details from the users prompt. It will be presented with the top 10 current memory buckets. If it does not think the bucket contains the needed info it will request for more until [END_OF_LIST] token. It will generate the function calls to the underlying memory system when it thinks a bucket is useful
- Create a Updater Agent Needed Updated Details
    Will cycle all the buckets until it finds a bucket that could be useful. If not it will suggest to create a new bucket. 
- Create an Observer Agent to determine if data is good
    - This agents objective is to simply provide the context information sparsely to allow the next agent to have the context information.