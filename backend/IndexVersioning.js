module.exports = new (function(){
	const path = require('path');
	const fs = require('fs');
	const StringsHelper = require('./../helpers/StringsHelper');
	const filePathIndex = path.join(__dirname, '/../../frontend/pages/index.html');
	const filePathIndexPrecompiled = path.join(__dirname, '/../../frontend/precompiled/index.html');
	const Configuration = require('./../configuration/Configuration');
	const useHttps = Configuration.getUseHttps();
	const precompiledFrontend = Configuration.getPrecompiledFrontend();
	console.log('it is');
	console.log(precompiledFrontend);
	const protocol = useHttps?'https://':'http://';
	var mapIpToVersion = new Map();
	var _raw;
	this.getVersionForIp = function(ip){
		console.log('getting righ tone');
		if(mapIpToVersion.has(ip)){
			return mapIpToVersion.get(ip);
		}
		return createVersionForIp(ip);
	};
	function createVersionForIp(ip){
		var raw = getRaw();
		if(ip){
			raw = StringsHelper.replaceAll(raw, "href='", "href='"+protocol+ip+'/');
			raw = StringsHelper.replaceAll(raw, "src='", "src='"+protocol+ip);
			raw = StringsHelper.replaceAll(raw, "=\\['\\/", "=['"+protocol+ip+'/');
		}
		mapIpToVersion.set(ip, raw);
		return raw;
	}
	function getRaw(){
		if(!_raw){
			_raw = String(fs.readFileSync(precompiledFrontend?filePathIndexPrecompiled:filePathIndex));
		}
		return _raw;
	};
})();