// Origin documentation
// https://fng-confluence.fox.com/pages/viewpage.action?spaceKey=SREO&title=S3+Usage+with+AWS+Console
// Staging origin
// https://origin.static.staging.us-east-1.aws-test.ngeo.com/interactive-assets/nggraphics/

// S3 upload documentation 
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html
// https://aws.amazon.com/blogs/developer/announcing-the-amazon-s3-managed-uploader-in-the-aws-sdk-for-javascript/

import path from 'path'
import fs from 'fs'
import log from 'fancy-log'

import rReaddir from 'recursive-readdir'
import chalk from 'chalk'
import _split from 'lodash.split'
import AWS from 'aws-sdk'
import Bottleneck from 'bottleneck'

import terrain from './lib/t.json'

const sep = "━━━━━━━━━━━━━━━━━━━━━━━━━━"

// AWS SETTINGS
const S3_REGION = 'us-east-1'
const S3_CREDENTIAL_PROFILE_PROD = 'ngp-prod'
const S3_BUCKET_PROD = 'www-natgeo-static-prod'
const S3_CREDENTIAL_PROFILE_STAGING = 'ngp-staging'
const S3_BUCKET_STAGING = 'www-natgeo-static-nonprod'
const S3_PREFIX_ROOT_PROJECTS = 'www.nationalgeographic.com/docs/specialprojects/interactive-assets/nggraphics'
const S3_PREFIX_ROOT_TILES = 'tiles.nationalgeographic.com/docs'

class GraphicsDeployer {
    constructor(options) {
        this.pathToCopy = null
        this.projectName = null
        this.artifactName = null
        this.publishUrl = null
        this.publishType = "project"
        this.staging = false
        this.log = null
        this.appendPathToLatest = null
        this.introMessage = this.uploadingMessage

        Object.assign(this, options)

        // error handling
        if (!this.projectName || !this.pathToCopy) {
            this.errorMessage()
            if (!this.projectName) {
                log(chalk.white.bgRed("* You must provide a unique project name"))
            }
            if (!this.pathToCopy) {
                log(chalk.white.bgRed("* You must provide a local path to copy"))
            }
            console.log('\r')
            return
        }

        // check for log location 
        if (this.log) {
            this.logData = require(path.join(process.cwd(), this.log))
            this.logKey = "published_" + this.publishType

            // update locations and subset files if we are appending an upload
            if (this.appendPathToLatest && this.tryUpdateForAppend() === false) {
                this.errorMessage()
                log(chalk.white.bgRed("* You cannot append to a non-existent tileset"))
                return
            }
        }

        // aws setup
        AWS.config.update({ region: S3_REGION })
        AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile: this.staging ? S3_CREDENTIAL_PROFILE_STAGING : S3_CREDENTIAL_PROFILE_PROD })


        // set bucket destination
        this.s3Bucket = this.staging ? S3_BUCKET_STAGING : S3_BUCKET_PROD

        // set base path destination
        if (this.publishType == "tileset") {
            this.s3PrefixRoot = S3_PREFIX_ROOT_TILES
        } else {
            this.s3PrefixRoot = S3_PREFIX_ROOT_PROJECTS
        }

        // set upload and public url base
        this.s3DestRoot = path.join(this.s3PrefixRoot, this.projectName, this.artifactName)
        this.publishDestRoot = this.publishUrl + path.join(this.projectName, this.artifactName)

        // run the uploader, return a promise
        return this.init()
    }

    init() {
        // show intro message
        this.introMessage()

        // Recursively path for files
        return Promise.resolve()
            .then(() => {
                // ignore .DS_Store
                return rReaddir(this.pathToCopy, [".DS_Store"])
            })
            .then(files => {
                return this.uploadFileList(files)
            })
            .then(results => {
                return this.analyzeResults(results)
            })
        // .catch(error => { throw new Error(error.message) })
    }
    settlePromises(arr) {



        // allow analysis of Promises
        return Promise.all(arr.map((promise, i) => {
                return promise.then(
                    value => ({ state: 'fullfilled', value }),
                    value => ({ state: 'rejected', value })
                )
            }))
            .catch(error => { throw new Error(error) })
    }

    uploadFileList(files) {
        // max sockets defaults to 50 
        // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/node-configuring-maxsockets.html
        const fileReadLimiter = new Bottleneck({
            maxConcurrent: 150
        })

        let uploaded = 1
        let concurrent = 0

        return this.settlePromises(files.map((file, i) => {
            const promise = () => {
                return new Promise((resolve, reject) => {

                    // Create S3 service object

                    const s3 = new AWS.S3({ apiVersion: '2006-03-01' })

                    //remove the local path prefix
                    const destPath = file.replace(this.pathToCopy, "")

                    const s3Path = path.join(this.s3DestRoot, destPath)
                    const publishPath = this.publishDestRoot + destPath

                    // build full path of file
                    const srcPath = path.join(process.cwd(), file)

                    // read local file into stream
                    const fileStream = fs.createReadStream(srcPath)


                    // build s3 desination params
                    const s3Params = {
                        Bucket: this.s3Bucket,
                        Key: s3Path,
                        Body: fileStream
                    }

                    // handle file read error
                    fileStream.on('error', err => {
                        // file read error

                        reject(err)
                        // resolve()
                    })

                    // track number of requests
                    concurrent++
                    // call S3 to upload with specified parameters
                    s3.upload(s3Params, /*{queueSize: 1000},*/ (err, data) => {
                        concurrent--
                        // console.log(concurrent)
                        if (err) {
                            log.error(chalk.red("❌\u0020\u0020" + s3Path))
                            log.error(chalk.red("↳\u0020\u0020Error: " + err))
                            // upload error
                            // file.close()
                            reject({ file: file, error: err })
                        }
                        if (data) {
                            log(chalk.green(`☁️\u0020\u0020 [${uploaded++}/${files.length}] ${publishPath}`))
                            // data.Location is the result
                            // file.close()
                            resolve({ file: file })
                        }
                    })


                })
            }
            // ensure that this file processing is rate limited 
            // to avoid file system problems when dealing with huge amounts of files
            // over 10,000 open read files things get screwy
            // to avoid doing this https://github.com/meteor/meteor/issues/8057
            return fileReadLimiter.schedule(promise)

        }))
        // .catch(error => {  throw new Error(error) })
    }

    writeUploadLog() {
        if (this.logData) {
            this.logData[this.logKey] = this.logData[this.logKey] || {}
            this.logData[this.logKey][this.projectName] = this.logData[this.logKey][this.projectName] || []
            this.logData[this.logKey][this.projectName].push({
                id: this.artifactName,
                url: this.publishUrl + path.join(this.projectName, this.artifactName)
            })

            fs.writeFileSync(this.log, JSON.stringify(this.logData, null, 4))

        }
    }


    tryUpdateForAppend() {
        if (this.logData[this.logKey]) {
            if (this.logData[this.logKey][this.projectName]) {
                    const log = this.logData[this.logKey][this.projectName]
                    const latestPublish = log.slice(-1).pop()

                    this.latestArtifact = latestPublish.id
                    this.introMessage = this.appendingMessage
                    this.pathToCopy = path.join(this.pathToCopy, this.appendPathToLatest)
                    this.artifactName = path.join(this.latestArtifact, this.appendPathToLatest)

                    return true
            }
        }
        return false
    }


    analyzeResults(results) {
        let rejection = false
        results.forEach(result => {
            if (result.state === 'fullfilled') {
                // log(chalk.green("☁️\u0020\u0020" + result.value.file))
            } else {
                rejection = true
                // log.error(chalk.red("❌\u0020\u0020" + result.value.file))
                // log.error(chalk.red("↳\u0020\u0020Error: " + result.value.error))
            }

        })

        // if any results are rejected, reject the group
        if (rejection) {
            this.errorMessage()
            return Promise.reject()
        } else {
            // dont write the log if appending no new artifact
            if (!this.appendPathToLatest) {
                this.writeUploadLog()
            }
            this.successMessage()
            return Promise.resolve()
        }

    }

    s3List(s3Params) {
        s3.listObjects(s3Params, function(err, data) {
            if (err) {
                log("Error", err)
            } else {
                log("Success", data)
            }
        })
    }


    appendingMessage() {
        console.log('\r')
        console.log(chalk.yellow(sep))
        console.log(chalk.yellow("\u0020☁️\u0020\u0020APPENDING FILES\u0020☁️"))
        console.log(chalk.yellow(`\u0020☁️\u0020\u0020to ${this.latestArtifact} \u0020☁️`))
        console.log(chalk.yellow(sep))
        console.log('\r')
    }

    uploadingMessage() {
        console.log('\r')
        console.log(chalk.green(sep))
        console.log(chalk.green("\u0020☁️\u0020\u0020UPLOADING FILES\u0020☁️"))
        // console.log(chalk.yellow("\u0020➡\u0020\u0020Dont forget to use the VPN (vpn.ngeo.com)!\u0020⬅"))
        console.log(chalk.green(sep))
        console.log('\r')
    }


    errorMessage() {
        console.log('\r')
        console.log(chalk.red(sep))
        console.log(chalk.red("\u0020❌\u0020\u0020GRAPHICS DEPLOYER ERROR. YOUR PROJECT WAS NOT SUCCESSFULLY PUBLISHED\u0020❌"))
        console.log(chalk.red(sep))
        console.log('\r')

    }

    successMessage() {
        //lulz
        //show emoji success. lodash _.split supports proper emoji unicode parsing
        let spaceTerrain = ""
        const terrainMessage = _split(terrain[Math.floor(Math.random() * terrain.length)].t, "")
        terrainMessage.forEach(function(d) {
            spaceTerrain += "\u0020\u0020" + d
        })
        //endlulz

        console.log('\r')
        console.log(chalk.green(sep))
        console.log(chalk.green('\u0020🌈\u0020\u0020PUBLISH SUCCESSFUL!\u0020🌈'))
        console.log(chalk.green(sep))
        console.log('\r')
        console.log(chalk.green('\u0020Now enjoy this pastoral landscape'))
        console.log('\r')
        console.log(spaceTerrain)
        console.log('\r')
        console.log(chalk.green(sep))
        console.log(chalk.green('\u0020💁\u0020\u0020PUBLISH DETAILS\u0020💁'))
        console.log(chalk.green(sep))

        console.log(chalk[this.staging ? "yellow" : "cyan"](`\u0020* Published ${this.staging ? "to staging" : "to production"}`))
        console.log(chalk.white(`\u0020* Origin: https://${this.s3Bucket}.s3.amazonaws.com/` + path.join(this.s3PrefixRoot, this.projectName, this.artifactName) + "\r"))

        console.log(chalk.white(`\u0020* AWS Console: https://s3.console.aws.amazon.com/s3/buckets/${this.s3Bucket}/${this.s3PrefixRoot}/${path.join(this.projectName, this.artifactName)}`))
        console.log(chalk.green(`\u0020* ${this.staging ? "Staging URL" : "Production URL"}: ${this.publishUrl}${path.join(this.projectName, this.artifactName)}`))
        console.log(chalk.green(sep))
        console.log(chalk.cyan(`\u0020* Remember to update your README.md!`))
        console.log(chalk.cyan(`\u0020* Remember to add your URL to the graphics spreadsheet: https://docs.google.com/spreadsheets/d/1z48U7xSRtkRsWckjdWSmNmBz0X36o4IJF9ipNaZBP-o/edit#gid=0`))
        console.log(chalk.green(sep))
        console.log('\r')

    }

    escapeShell(cmd) {
        return cmd.replace(/(["\s'$`\\])/g, '\\$1')
        // return '"'+cmd.replace(/(["\s'$`\\])/g,'\\\$1')+'"'
    }
}

export default GraphicsDeployer
