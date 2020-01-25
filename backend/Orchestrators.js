const ClientDataOrchestratorServer = require('./ClientDataOrchestratorServer');
const ClientDataOrchestratorClient =require('./ClientDataOrchestratorClient');
const PageAssetsOrchestrator = require('./PageAssetsOrchestrator');
const Servers = require('server').Servers;
module.exports = function(params){
  const self = this;
  return new Promise((resolve, reject)=>{
    const hosts = params.hosts, hostMe = params.hostMe, sourceScriptsLocally = params.sourceScriptsLocally,
    useHttps = params.useHttps, godaddyConfiguration = params.godaddyConfiguration,
    domain = params.domain, loadBalancingConfiguration = params.loadBalancingConfiguration,
    getNConnections=params.getNConnections,useLocal=params.useLocal,
	filePathIndex=params.filePathIndex, filePathIndexPrecompiled=params.filePathIndexPrecompiled, 
	precompiledFrontend=params.precompiledFrontend;
    if(!hostMe)throw new Error('No hostMe provided');
    if(!hosts)throw new Error('No hosts provided');
    if(sourceScriptsLocally===undefined)throw new Error('No sourceScriptsLocally provided');
    if(useHttps===undefined)throw new Error('No useHttps provided');
    if(useLocal===undefined)throw new Error('No useLocal provided');
    if(!godaddyConfiguration)throw new Error('No godaddyConfiguration provided');
    if(!domain)throw new Error('No domain provided');
    if(!loadBalancingConfiguration)throw new Error('No loadBalancingConfiguration provided');
    if(precompiledFrontend===undefined)throw new Error('No precompiledFrontend provided');
    if(!filePathIndex)throw new Error('No filePathIndex provided');
    if(!filePathIndexPrecompiled)throw new Error('No filePathIndexPrecompiled provided');
    var pageAssetsOrchestrator, clientDataOrchestratorClient;
    Servers.getForPort(80).then((server)=>{
      const iAmClientData = hostMe.getClientData(),
        iAmPageAssets = hostMe.getPageAssets(),
        iAmOrchestrator = hostMe.getOrchestrator();
      server.get('/', function(req, res, next){
        console.log('/');
        if(!pageAssetsOrchestrator||sourceScriptsLocally)return next();
        pageAssetsOrchestrator.sendIndexPage(res);
      });
      if(iAmPageAssets){
        if(useLocal){
          var endpointLocal = JSON.stringify({localhost:1});
          server.get('/endpoints',function(req, res, next){
            console.log(endpointLocal);
            res.send(endpointLocal);
          });
        }
        else
        {
          server.get('/endpoints',function(req,res,next){
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
          loadBalancingConfiguration.getClientData(), domain);
      }
      if(iAmOrchestrator){
        ClientDataOrchestratorServer.initialize(hosts, hostMe.getId(), loadBalancingConfiguration.getClientData());
      }
      resolve(self);
    }).catch(reject);
  });
};