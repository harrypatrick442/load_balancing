const LoadBalancing = require('load_balancing');
const {ClientDataOrchestratorServer, ClientDataOrchestratorClient, PageAssetsOrchestrator} = LoadBalancing;
module.exports = function(params){
	const hosts = params.hosts, hostMe = params.hostMe, sourceScriptsLocally = params.sourceScriptsLocally,
	useHttps = params.useHttps, godaddyConfiguration = params.godaddyConfiguration,
	domain = params.domain, loadBalancingConfiguration = params.loadBalancingConfiguration,
	getNConnections=params.getNConnections;
	if(!hostMe)throw new Error('No hostMe provided');
	if(!hosts)throw new Error('No hosts provided');
	if(sourceScriptsLocally===undefined)throw new Error('No sourceScriptsLocally provided');
	if(useHttps===undefined)throw new Error('No useHttps provided');
	if(!godaddyConfiguration)throw new Error('No godaddyConfiguration provided');
	if(!domain)throw new Error('No domain provided');
	if(!loadBalancingConfiguration)throw new Error('No loadBalancingConfiguration provided');
	var pageAssetsOrchestrator, clientDataOrchestratorClient;
	const iAmClientData = hostMe.getClientData(),
		iAmPageAssets = hostMe.getPageAssets(),
		iAmOrchestrator = hostMe.getOrchestrator();
	app.get('/', function(req, res, next){
		console.log('/');
		if(!pageAssetsOrchestrator||sourceScriptsLocally)return next();
		pageAssetsOrchestrator.sendIndexPage(res);
	});
	if(iAmPageAssets){
		if(useLocal){
			var endpointLocal = JSON.stringify({localhost:1});
			app.get('/endpoints',function(req, res, next){
				console.log(endpointLocal);
				res.send(endpointLocal);
			});
		}
		else
		{
			app.get('/endpoints',function(req,res,next){
				if(clientDataOrchestratorClient)
					res.send(clientDataOrchestratorClient.getEndpointsString());
				else res.end();
			});
		}
	}
	if(iAmPageAssets){
		pageAssetsOrchestrator = new PageAssetsOrchestrator(hosts, hostMe, filePathIndex, filePathIndexPrecompiled, 
			domain, precompiledFrontend, useHttps, godaddyConfiguration);
	}
	if(iAmClientData||iAmPageAssets){
		console.log(loadBalancingConfiguration);
		clientDataOrchestratorClient = new ClientDataOrchestratorClient(getNConnections, hosts, hostMe,
			loadBalancingConfiguration, domain);
	}
	if(iAmOrchestrator){
		ClientDataOrchestratorServer.initialize(hosts, hostMe.getId(), loadBalancingConfiguration.getClientData());
	}
};