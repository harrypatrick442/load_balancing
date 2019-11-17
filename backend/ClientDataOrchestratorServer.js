module.exports = new(function(){
	const InterserverCommunication = require('interserver_communication');
	const Router = InterserverCommunication.Router;
	const ClientDataOrchestratorStrings=require('./ClientDataOrchestratorStrings');
	const HostHelper = require('hosts').HostHelper;
	const Core = require('core');
	const Timer = Core.Timer;
	const each = Core.each;
	var mapHostIdToAllowedHost = new Map();
	var initialized = false;
	var mapHostIdToState = new Map();
	var lastOverallStateSnapshot=new OverallStateSnapshot(0);
	var hostIdMe, timer,pageAssetsHostIds,updateDelay, minRateOfJoiningDevicesPerSecond,maxRateOfJoiningDevicesPerSecond,hostActiveTimeoutDelay
	this.initialize = function(hosts, hostIdMeIn, loadBalancingConfiguration){
		updateDelay = loadBalancingConfiguration.getOrchestratorServerUpdateDelay();
		minRateOfJoiningDevicesPerSecond= loadBalancingConfiguration.getMinRateOfJoiningDevicesPerSecond();
		maxRateOfJoiningDevicesPerSecond= loadBalancingConfiguration.getMaxRateOfJoiningDevicesPerSecond();
		hostActiveTimeoutDelay = loadBalancingConfiguration.getHostActiveTimeoutDelay();
		if(initialized)throw new Error('Already initialized');
		hostIdMe = hostIdMeIn;
		Router.get().addMessageCallback(ClientDataOrchestratorStrings.CLIENT_DATA_ORCHESTRATED_INFO, onOrchestratedInfo);
		pageAssetsHostIds = hosts.where(host=>host.getPageAssets()&&host.getActive()).select(host=>host.getId()).toList();
		mapHostIdToAllowedHost=hosts.where(host=>host.getClientData()&&host.getActive()).toMap(host=>host.getId(), host=>host);
		mapHostIdToAllowedHost.forEach(function(host){
			mapHostIdToState.set(host.getId(), new State(host));
		});
		timer = new Timer({callback:updatePreferences, delay:updateDelay, nTicks:-1});
		timer.start();
		initialized = true;
	};
	this.localOrchestratedInfo = function(msg){
		_onOrchestratedInfo(msg, hostIdMe);
	};
	function onOrchestratedInfo(msg, channel){
		var hostId = channel.getHostId();
		_onOrchestratedInfo(msg, hostId);
	}
	function _onOrchestratedInfo(msg, hostId){
		if(!initialized)return; 
		var host = mapHostIdToAllowedHost.get(hostId);
		if(!host)return;
		var nDevices = msg.nDevices;
		var state;
		if(mapHostIdToState.has(hostId)){
			state=mapHostIdToState.get(hostId);
			state.setActive();
		}
		else{//shouldnt ever be needed now but best leave here for now.
			state = new State(host);
			mapHostIdToState.set(host.getId(), state);
		}
		state.setNDevices(nDevices);
	}
	function updatePreferences(){
		var activeHostStates = getActiveHostStates();
		if(activeHostStates.length<1)activeHostStates = getApproximateHostStates();
		var statesWithLoadDeficite = calculateDesiredChangeInLoads(activeHostStates);
		var msg ={ type: ClientDataOrchestratorStrings.CLIENT_DATA_ORCHESTRATOR_PREFERENCES,
			mapHostToWeight:statesWithLoadDeficite.toObj(state=>state.getHost().getIp(), state=>state.getDesiredChangeInLoad())
		};
		Router.get().sendToHostIds(pageAssetsHostIds, msg);
	}
	function getApproximateHostStates(){
		var activeHostStates=[];
		
		mapHostIdToState.forEach(function(state, hostId){activeHostStates.push(state);});
		return activeHostStates;
	}
	function getActiveHostStates(){
		var activeHostStates=[];
		var now = getTime();
		var cutoff = now - hostActiveTimeoutDelay;
		mapHostIdToState.forEach(function(state, hostId){
			if(state.getLastActive() >=cutoff)
				activeHostStates.push(state);
		});
		return activeHostStates;
	}
	
	function calculateDesiredChangeInLoads(states){
		var estimatedFutureTotalLoadAtEnd=calculateEstimatedFutureTotalLoad(states);
		var loadHandlingFactorsTotal = getLoadHandlingFactorsTotal(states);
		each(states, function(state){
			var desiredChangeInLoad = calculateDesiredChangeInLoadForServer(state, loadHandlingFactorsTotal, estimatedFutureTotalLoadAtEnd);
			state.setDesiredChangeInLoad(desiredChangeInLoad);
		});
		var statesWithDeficite = states.where(state=>state.getDesiredChangeInLoad()>0).toList();
		if(statesWithDeficite.length<1){
			each(states, function(state){
				state.setDesiredChangeInLoad(1);
			});
			return states;
		}
		//these will always be positive.
		var newLoadHandlingFactorsTotal = getLoadHandlingFactorsTotal(statesWithDeficite);
		each(statesWithDeficite, function(state){
			var desiredChangeInLoad = calculateDesiredChangeInLoadForServer(state, newLoadHandlingFactorsTotal, estimatedFutureTotalLoadAtEnd);
			state.setDesiredChangeInLoad(desiredChangeInLoad);
		});
		return statesWithDeficite;
	}
	function calculateCurrentRateOfJoining(currentNDevicesTotal){
		var now = getTime();
		var changeInNDevices = currentNDevicesTotal - lastOverallStateSnapshot.getNDevicesTotal();
		var currentRateOfJoiningDevicesPerSecond = changeInNDevices*1000/(now - lastOverallStateSnapshot.getCapturedAt());
		lastOverallStateSnapshot= new OverallStateSnapshot(currentNDevicesTotal, now);
		if(currentRateOfJoiningDevicesPerSecond>maxRateOfJoiningDevicesPerSecond)
			currentRateOfJoiningDevicesPerSecond=maxRateOfJoiningDevicesPerSecond;
		else if(currentRateOfJoiningDevicesPerSecond<minRateOfJoiningDevicesPerSecond)
			currentRateOfJoiningDevicesPerSecond=minRateOfJoiningDevicesPerSecond;
		return currentRateOfJoiningDevicesPerSecond;
	}
	function calculateEstimatedFutureTotalLoad(states){
		var currentNDevicesTotal = states.select(state=>state.getNDevices()).sum();
		return currentNDevicesTotal+calculateCurrentRateOfJoining(currentNDevicesTotal);
	}
	function calculateDesiredChangeInLoadForServer(state, loadHandlingFactorsTotal, estimatedFutureTotalLoadAtEnd){
		return (state.getHost().getLoadHandlingFactor()*estimatedFutureTotalLoadAtEnd/ loadHandlingFactorsTotal)-state.getNDevices();
	}
	function getLoadHandlingFactorsTotal(states){
		return states.select(state=>state.getHost().getLoadHandlingFactor()).sum();
	}
	function getTime(){
		return new Date().getTime();
	}
	function State(host){
		var nDevices;
		var lastActive = getTime();
		var desiredChangeInLoad=0;
		this.setNDevices = function(value){
			nDevices = value;
		};
		this.getNDevices = function(){
			return nDevices;
		};
		this.setActive = function(){
			lastActive = getTime();
		};
		this.getLastActive=function(){
			return lastActive;
		};
		this.setDesiredChangeInLoad=function(value){
			desiredChangeInLoad=value;
		};
		this.getDesiredChangeInLoad = function(){
			return desiredChangeInLoad;
		};
		this.getHost = function(){return host;};
	}
	function OverallStateSnapshot(nDevicesTotal, capturedAt){
		this.getNDevicesTotal = function(){
			return nDevicesTotal;
		};
		this.getCapturedAt = function(){
			return capturedAt;
		};
	}
})();