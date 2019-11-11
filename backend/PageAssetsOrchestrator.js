module.exports = function(hosts, hostMe){
	const CHANNEL_CLOSED='channelClosed';
	const CHANNEL_OPENED='channelOpened';
	const N_ENTRIES_ROUND_ROBBIN=100;
	const Router = require('./../interserver_communication/Router');
	const Configuration = require('./../configuration/Configuration');
	const loadBalancingConfiguration = Configuration.getLoadBalancing().getPageAssets();
	const orchestratorClientUpdateDelay = loadBalancingConfiguration.getOrchestratorClientUpdateDelay();
	const PageAssetsOrchestratorStrings=require('./PageAssetsOrchestratorStrings');
	const HostHelper = require('./../helpers/HostHelper');
	const TemporalCallback = require('./../../../core/backend/TemporalCallback');
	const CircularBuffer = require('./../../../core/backend/CircularBuffer');
	const IndexVersioning = require('./IndexVersioning');
	const Godaddy = require('./../godaddy/Godaddy');
	var pointedToByDomain= hostMe.getPointedToByDomain();
	const domain = Configuration.getDomain();
	var _mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor;
	var iAmTheDoorman = false;
	var nRequestTaken=0;
	var activatingMe = false;
	var circularBufferIps;
	this.sendIndexPage=function(res){
		if(!circularBufferIps)return null;
		var html = IndexVersioning.getVersionForIp(circularBufferIps.next());
		res.setHeader('Content-Type', 'text/html');
		res.send(html);
	};
	var recordsToUpdate = ['A'];
	var privateChannels = Router.get().getPrivateChannels();
	var temporalCallbackUpdateHostsRoundRobbin= new TemporalCallback({maxNTriggers:20, maxTotalDelay:10000, delay:3000, callback:updateHostsRoundRobbin});
	var temporalCallbackSeeIfIAmBeingActivatedAndTakeAction = new TemporalCallback({maxNTriggers:20, maxTotalDelay:10000, delay:3000, callback:seeIfIAmBeingActivatedAndTakeAction});
	privateChannels.addEventListener(CHANNEL_CLOSED, channelClosed);
	privateChannels.addEventListener(CHANNEL_OPENED, channelOpened);
	findOutIfIAmDoorman().then(function(iAmDoorman){
		if(iAmDoorman)
			scheduleUpdateHostsRoundRobbin();
	}).catch(error);
	function activateMeAsPageAssetsDoorman(){
		if(activatingMe)return;
		activatingMe = true;
		console.log('Setting DNS to point to me');
		setDNSToPointToHost(hostMe).then(function(){
			iAmTheDoorman = true;
			activatingMe = false;
		}).catch(activateAsMeFailed);
	}
	function activateAsMeFailed(err){
		activatingMe = false;
		console.error(err);
	}
	function setDNSToPointToHost(host){
		return new Promise(function(resolve, reject){
			Godaddy.getRecords(domain, 'A', '@').then(function(records){
				var record = records.where(record=>recordsToUpdate.indexOf(record.getType())>=0).firstOrDefault();
				if(!record)throw new Error('No A record');
				record.setData(host.getIp());
				Godaddy.replaceRecords(domain, record.getType(), record.getName(), record).then(resolve).catch(reject);
			}).catch(reject);
		});
	}
	function channelClosed(e){
		scheduleSeeIfIAmBeingActivatedAndTakeAction();
		scheduleUpdateHostsRoundRobbin();
	}
	function channelOpened(e){
		seeIfIAmBeingActivatedAndTakeAction();
		scheduleUpdateHostsRoundRobbin();
	}
	function scheduleSeeIfIAmBeingActivatedAndTakeAction(){
		temporalCallbackSeeIfIAmBeingActivatedAndTakeAction.trigger();
	}
	function seeIfIAmBeingActivatedAndTakeAction(){
		getMapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor().then(function(mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor){
			var hostIdNextBestOnline = getHostIdToNextBestOnlinePageAssetsHost(mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor);
			if(hostIdNextBestOnline==hostMe.getId())
				activateMeAsPageAssetsDoorman();
			
		}).catch(error);
	}
	function getHostIdToNextBestOnlinePageAssetsHost(mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor){
		var mapHostIdToChannel =getMapHostIdToChannel();
		var iterator = mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor.keys();
		var entry;
		while(!(entry = iterator.next()).done){
			var hostId= entry.value;
			if(!mapHostIdToChannel.has(hostId)){
				if(hostId===hostMe.getId())return hostMe.getId();
				continue;
			}
			var channel = mapHostIdToChannel.get(hostId);
			if(channel.getIsOpen()){
				return channel.getHostId();
			}
		}
	}
	function getMapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor(){
		return new Promise(function(resolve, reject){
			if(_mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor){
				resolve(_mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor);
				return;
			}
			var pageAssetsHosts = hosts.where(host=>host.getPageAssets()).toList();
			if(pageAssetsHosts.length<1){
				reject(new Error('No host orchestrators'));
				return;
			}
			_mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor=
			pageAssetsHosts.orderByDesc(host=>host.getLoadHandlingFactor()).toMap(key=>key.getId(), value=>value);
			resolve(_mapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor);
		});
	}
	function scheduleUpdateHostsRoundRobbin(){
		temporalCallbackUpdateHostsRoundRobbin.trigger();
	}
	function updateHostsRoundRobbin(){
		getOnlinePageAssetsChannels().then(function(onlinePageAssetsChannels){
			circularBufferIps= new CircularBuffer(getScaledProportionalIpsArray(onlinePageAssetsChannels));
		});
	}
	function getScaledProportionalIpsArray(channels){
		var totalLoadHandlingFactor = channels.select(channel=>channel.getHost().getLoadHandlingFactor()).sum()+hostMe.getLoadHandlingFactor();
		var multiplierLoadHandlingFactor = N_ENTRIES_ROUND_ROBBIN/totalLoadHandlingFactor;
		var buckets = channels.select(function(channel){
			return {value:channel.getIp(), nLeft:(Math.floor(multiplierLoadHandlingFactor*channel.getHost().getLoadHandlingFactor()))};
		}).toList();
		buckets.push({value:null, nLeft:Math.floor(multiplierLoadHandlingFactor*hostMe.getLoadHandlingFactor())});
		buckets.forEach(function(bucket){
			bucket.nInitial = bucket.nLeft;
		});
		var nItemsLeft = buckets.select(bucket=>bucket.nLeft).sum();
		var ipsArray=[];
		while(nItemsLeft>0){
			var bucket = buckets.select(bucket=>[bucket, bucket.nInitial>0?(bucket.nLeft/bucket.nInitial):0])
			.orderByDesc(pair=>pair[1]).first()[0];
			ipsArray.push(bucket.value);
			bucket.nLeft--;
			nItemsLeft--;
		}
		return ipsArray;
	}
	function getOnlinePageAssetsChannels(){
		return new Promise(function(resolve, reject){
			var arr=[];
			var mapHostIdToChannel =getMapHostIdToChannel();
			getMapPageAssetServerHostIdToHostOrderedByLoadHandlingFactor().then(function(map){
				var iterator = map.keys();
				var entry;
				while(!(entry = iterator.next()).done){
					var hostId= entry.value;
					if(!mapHostIdToChannel.has(hostId))continue;
					var channel = mapHostIdToChannel.get(hostId);
					if(channel.getIsOpen()){
						arr.push(channel);
					}
				}
				resolve(arr);
			}).catch(reject)
		});
	}
	function getMapHostIdToChannel(){
		return Router.get().getChannels().getArray().toMap(channel=>channel.getHostId(), channel=>channel)
	}
	function error(err){
		console.error(err);
	}
	function findOutIfIAmDoorman(){
		return new Promise(function(resolve, reject){
			Godaddy.getRecords(domain, 'A', '@').then(function(records){
				resolve(records.select(record=>record.getData()==hostMe.getIp()).count()>0);
			}).catch(reject);
		});
	}
};