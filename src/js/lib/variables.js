let assetRoot,
	 localRoot = "",
	 deployRoot = "@@deployRoot";

assetRoot = deployRoot.indexOf("//") > -1 ? deployRoot : localRoot;

module.exports = {
	//do not edit this
	root: assetRoot
};