// https://developers.google.com/drive/v3/web/quickstart/nodejs

var fs = require('fs');
var url = require('url');
var path = require('path');
var Entities = require('html-entities').AllHtmlEntities;
var archieml = require('archieml');
var htmlparser = require('htmlparser2');
var gAuth = require('./gAuth/gAuth');
var google = require('googleapis');


function GoogleDriveAml2Json(opts) {
    this.FILEKEY = opts.fileId;
    this.DESTPATH = opts.dest;
    // Load client secrets from a local file.
    gAuth.authorize(this.fetchFile.bind(this));
}

GoogleDriveAml2Json.prototype.fetchFile = function(auth) {

    var drive = google.drive('v3');
    var fileId = this.FILEKEY;
    drive.files.get({
        auth: auth,
        fileId: fileId,
    }, (err, res) => {
        if (err) return console.error("error", err)
        this.FILENAME = res.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        drive.files.export({
                auth: auth,
                fileId: fileId,
                mimeType: 'text/html'
            }, this.processFile.bind(this))
            .on('end', function() {
                console.log("\"" + res.name + "\" successfully downloaded")
            })
            .on('error', function(err) {
                console.log('Error during download', err);
            })

    })



}



GoogleDriveAml2Json.prototype.processFile = function(err, body) {
    if (err) return console.log("error")

    var _this = this;
    var handler = new htmlparser.DomHandler((error, dom) => {
        var func;
        var tagHandlers = {
            _base: function(tag) {
                var str = '';
                tag.children.forEach(function(child) {
                    if (func = tagHandlers[child.name || child.type]) str += func(child);
                });
                return str;
            },
            text: function(textTag) {
                return textTag.data;
            },
            span: function(spanTag) {
                return tagHandlers._base(spanTag);
            },
            p: function(pTag) {
                return tagHandlers._base(pTag) + '\n';
            },
            a: function(aTag) {
                var href = aTag.attribs.href;
                if (href === undefined) return '';

                // extract real URLs from Google's tracking
                // from: http://www.google.com/url?q=http%3A%2F%2Fwww.nytimes.com...
                // to: http://www.nytimes.com...
                if (aTag.attribs.href && url.parse(aTag.attribs.href, true).query && url.parse(aTag.attribs.href, true).query.q) {
                    href = url.parse(aTag.attribs.href, true).query.q;
                }

                var str = '<a href="' + href + '">';
                str += tagHandlers._base(aTag);
                str += '</a>';
                return str;
            },
            li: function(tag) {
                return '* ' + tagHandlers._base(tag) + '\n';
            }
        };

        ['ul', 'ol'].forEach(function(tag) {
            tagHandlers[tag] = tagHandlers.span;
        });
        ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(function(tag) {
            tagHandlers[tag] = tagHandlers.p;
        });

        var body = dom[0].children[1];
        var parsedText = tagHandlers._base(body);

        // Convert html entities into the characters as they exist in the google doc
        var entities = new Entities();
        parsedText = entities.decode(parsedText);

        // Remove smart quotes from inside tags
        parsedText = parsedText.replace(/<[^<>]*>/g, function(match) {
            return match.replace(/”|“/g, '"').replace(/‘|’/g, "'");
        });

        var parsed = archieml.load(parsedText);

        _this.writeParsed(parsed)
    });

    var parser = new htmlparser.Parser(handler);

    parser.write(body);
    parser.done();


}


GoogleDriveAml2Json.prototype.initDir = function(targetDir) {
    //recursive directory structure creation
    var sep = path.sep;
    var initDir = path.isAbsolute(targetDir) ? sep : '';
    targetDir.split(sep).reduce((parentDir, childDir) => {
        var curDir = path.resolve(parentDir, childDir);
        if (!fs.existsSync(curDir)) {
            fs.mkdirSync(curDir);
        }

        return curDir;
    }, initDir);

}



GoogleDriveAml2Json.prototype.writeParsed = function(parsed) {
    // create directory tree if needbe
    this.initDir(this.DESTPATH)
    //write the file
    var dest = path.join(this.DESTPATH, this.FILENAME + ".json");
    fs.writeFile(dest, JSON.stringify(parsed, null, 2), function() {
        console.log("File written to " + dest)
    })
}


module.exports = GoogleDriveAml2Json
