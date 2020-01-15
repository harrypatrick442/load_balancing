module.exports = function(getNDevices, hosts, hostMe, loadBalancingConfiguration){
	const InterserverCommunication = require('interserver_communication');
	const Router = InterserverCommunication.Router;
	const ClientDataOrchestratorStrings=require('./ClientDataOrchestratorStrings');
	const ClientDataOrchestratorServer = require('./ClientDataOrchestratorServer');
	const orchestratorClientUpdateDelay = loadBalancingConfiguration.getOrchestratorClientUpdateDelay();
	const Hosts = require('hosts');
	const HostHelper = Hosts.HostHelper;
	const Core = require('core');
	const Timer = Core.Timer;
	const isClientDataHost = hostMe.getClientData();
	const isPageAssetsHost = hostMe.getPageAssets();
	var _orchestratorServerHostIds;
	var timer,endpointsString; 
	if(isPageAssetsHost){
		endpointsString=getInitialEndpointsString(); 
		Router.addMessageCallback(ClientDataOrchestratorStrings.CLIENT_DATA_ORCHESTRATOR_PREFERENCES, onPreferences);
	}
	if(isClientDataHost){
		timer= new Timer({callback:sendOrchestratedInfoToOrchestratorServer, delay:orchestratorClientUpdateDelay, nTicks:-1});
		timer.start();
	}
	this.getEndpointsString = function(){
		if(!isPageAssetsHost)throw new Error('Not a page assets host so this shouldn\'t be being called');
		return endpointsString;
	};
	function getOrchestratorServerHostIds(){
		return new Promise(function(resolve, reject){
			if(_orchestratorServerHostIds){
				resolve(_orchestratorServerHostIds);
				return;
			}
			HostHelper.getHosts().then(function(hosts){
				var orchestratorHosts = hosts.where(host=>host.getOrchestrator()).select(host=>host.getId()).toList();
				if(orchestratorHosts.length<1){
					reject(new Error('No host orchestrators'));
					return;
				}
				_orchestratorServerHostIds = orchestratorHosts;
				resolve(_orchestratorServerHostIds);
			}).catch(reject);
		});
	}
	function sendOrchestratedInfoToOrchestratorServer(){
		sendOrchestratedInfo(calculateOrchestratedInfo());
	}
	function calculateOrchestratedInfo(){
		return {type:ClientDataOrchestratorStrings.CLIENT_DATA_ORCHESTRATED_INFO, nDevices:getNDevices()};
	}
	function sendOrchestratedInfo(orchestratedInfo){
		getOrchestratorServerHostIds().then(function(orchestratorServerHostIds){
			var hostIdsOthers=[];
			orchestratorServerHostIds.forEach(function(orchestratorServerHostId){
				if(orchestratorServerHostId==hostMe.getId())ClientDataOrchestratorServer.localOrchestratedInfo(orchestratedInfo);
				else hostIdsOthers.push(orchestratorServerHostId);
			});
			Router.sendToHostIds(hostIdsOthers, orchestratedInfo);
		}).catch(error);
	}
	function onPreferences(msg)  {
		endpointsString = JSON.stringify(msg.mapHostToWeight);
	}
	function getInitialEndpointsString(){
		return JSON.stringify(hosts.where(host=>host.getClientData()).toObj(host=>host.getIp(), host=>1));
	}
	function error(err){
		console.error(err);
	}
};