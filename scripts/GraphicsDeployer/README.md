## NG Graphics Deployer

This tool is for automating the uploading of assets to the interactive assets server.

### Instructions

Include this repo as a package.json dependency

```
"dependencies" {
	"ngm-graphics-deployer": "git@github.com:natgeo/ngm-graphics-deployer.git#master"
},
```

Then use it like this. graphicsDeployer returns a Promise.

```
var graphicsDeployer = require('ngm-graphics-deployer');

graphicsDeployer({
	// REQUIRED: Path to local assets. A trailing slash will deploy the *contents*. 
	// Without trailing slash, will deploy the entire folder listed
	pathToCopy: "/path/to/local/assets/",
	// REQUIRED: assets will be uploaded to a folder named this on the server
	projectName: "project-name" 
	// OPTIONAL: name of folder/package within local assets to show in output message
	artifactName: build-2016-12-15_10-15-30
})

```

This will result in the contents of the local path being copied to:

```
http://www.nationalgeographic.com/interactive-assets/nggraphics/project-name/
```
_Files uploaded will overwrite without warning, without cleaning up cruft. It's highly recommended you upload a timestamped folder to maintain deploy versions without collision._
