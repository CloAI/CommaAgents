# CommaAgents Hub: Publish and Share!
CommaAgents Hub is a place where you can publish and actively use others peoples agents, flows, and strategies

Visit the website to see directly (commaagents.com/hub) to see available agents, flows, and strategies. 

Our git repo for libraries is located here, this is where you can fork and create your own agents, flows, and strategies. You can create a PR to get approved for your agent, flows, and strategies to be accepted for everyone. 

## How to Access Hub Items
To access hub services we've altered the python import to support remote fetching of the hub items as needed. You simply import the item in the following format. `comma_agents.hub.{module_type(agent, flows, strategies)}.{username}.{module_name}`.

### Note about editors
You might not have any of the typing or get in editor errors that the import is not available. You will need to run the python script at least once for the runtime fetching to happen. However, once that is done, most IDEs should dynamically pick up the typing and source.

## Offline use (TODO! NOT YET AVAILABLE)
If you are not connected to the internet you can prefetch the modules you need before you go offline. However, you can also install the whole comma_agents hub. We provide also a PyPi(pip) install option `pip install comma_agents_hub` that will allow you to install all of the hub, and be able to access everything.

