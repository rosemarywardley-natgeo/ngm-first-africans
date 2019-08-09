'use strict'

import fs from 'fs';
import path from 'path';
import gulp from 'gulp';
import log from 'fancy-log'
import chalk from 'chalk'
import del from 'del';
import browserSync from 'browser-sync';
import handlebars from 'gulp-compile-handlebars';
import stringify from 'stringify';
import sass from 'gulp-sass';
import gdata from 'gulp-data';
import archieml from 'gulp-archieml';
import postcss from 'gulp-postcss';
import autoprefixer from 'autoprefixer';
import sourcemaps from 'gulp-sourcemaps';
import browserify from 'browserify';
import watchify from 'watchify';
import hbsfy from 'hbsfy';
import babelify from 'babelify';
import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';
import replace from 'gulp-replace-task';
import cssmin from 'gulp-cssmin';
import uglify from 'gulp-uglify';
import prefixer from 'gulp-url-prefixer';
import urljoin from 'urljoin';
import opn from 'opn';
import babel from 'gulp-babel';
import yargs from 'yargs'
import runSequence from 'run-sequence';
import GraphicsDeployer from './scripts/GraphicsDeployer/GraphicsDeployer.js';
import GoogleDriveAml2json from './scripts/gDrive/GoogleDriveAml2json.js';
import trudyConfig from './config.json';

const staging = false;
const publishUrl = staging ? 'https://www-staging.nationalgeographic.com/interactive-assets/nggraphics/' : 'https://www.nationalgeographic.com/interactive-assets/nggraphics/'
const tilesUrl = 'https://tiles.nationalgeographic.com/'
const tzoffset = (new Date()).getTimezoneOffset() * 60000;
const timePath = 'build-' + (new Date(Date.now() - tzoffset)).toISOString().replace(/T/g, '_').replace(/:/g, '-').split('.')[0];
const cwd = path.basename(process.cwd());
const templates = fs.readdirSync("src/html/__templates").map(file => { return file.split(".")[0] })

const PATHS = {
    publishUrl: publishUrl,
    tilesUrl: tilesUrl,
    publicPrefix: publishUrl + cwd + '/' + timePath,
    timePath: timePath,
    cwd: cwd,
    src: 'src',
    dev: '.dev',
    publish: 'publish/' + timePath,
    tiles: 'large-files/tiles/',
    hbsData: 'data/hbs/',
    html: 'src/html/**/*.html',
    assets: 'src/ngm-assets/**/**',
    css: ['src/sass/**/*.{scss,css}','src/components/**/*.{scss,css}'],
    js: 'src/js/**/*.{js,hbs}'
};

const CONFIG = {
    staging: staging,
    browserSync: {
        server: {
            baseDir: PATHS.dev,
        },
        xip: true,
        ghostMode: {
            clicks: false,
            forms: false,
            scroll: false
        },
        notify: false,
        logLevel: 'info',
        logFileChanges: false,
        open: false,
        // This middleware allows templates to live in subdirectory
        // Also handles optional .html suffix on files and trailing slashes
        middleware: function(req, res, next) {
            const pathSplitSlash = req.url.split('/')
            const pathSplitDot = req.url.split('.');
            // top level path is root
            if (req.url == "/") {
                req.url = "/__templates/"
            // top level template requests
            } else if (pathSplitSlash[1] && !pathSplitSlash[2]) {
                // check if need extension
                req.url = "/__templates/" + pathSplitSlash[1] + (pathSplitDot.length == 1 ? ".html" : "")
            // rewrite asset urls if top level url has a trailing slash     
            } else {
                pathSplitSlash.forEach(function(path, i) {
                    // if assets think they're in a subdir
                    // rebuild the url to erase the subdir
                    templates.forEach(function(template) {
                        if (path == template) {
                            req.url = "/" + pathSplitSlash.slice(i+1).join("/")
                        }
                    })
                })
            }
            return next();
        }
    },
    browserify: {
        entries: [PATHS.src + '/js/base.js'],
        debug: true,
        // noParse: ignoreDirs,
        plugin: [watchify],
        // needed for watchify
        // ignoreWatch: ['**/node_modules/**'],
        cache: {},
        packageCache: {},
    },
    browserifyPreProd: {
        entries: [PATHS.src + '/js/base.js'],
        debug: true,
        cache: {},
        packageCache: {},
    },
    hbs: {
        // https://github.com/kaanon/gulp-compile-handlebars/#options
        // turn this path into partials
        batch: [PATHS.src + '/html', PATHS.src + '/html/__partials'],
        helpers: {
            // take a freeform archie block (e.g.: [+text]) and turn array of values into <p> tags
            // take a string and wrap it with a p tag
            // e.g.: {{p google_doc.text}}
            p: (stuff) => {
                if (Array.isArray(stuff)) {
                    return new handlebars.Handlebars.SafeString(stuff.map(p => {
                        return "<p>" + p.value + "</p>"
                    }).join('\n'))
                } else {
                    return new handlebars.Handlebars.SafeString(
                        "<p>" + stuff + "</p>"
                    )
                }
            },
            svg: function(path) {
                let svg = fs.readFileSync(path, 'utf-8');
                // replace data-name, this is an illustrator thing
                svg = svg.replace(/data-name/g, "class");
                return new handlebars.Handlebars.SafeString(svg);
            }
        }
    },
    hbsData: {},
    stringify: {
        // what file extensions do we want to parse as text so they can be imported/required
        appliesTo: { includeExtensions: ['.geojson', '.topojson', '.txt', '.csv', '.tsv'] },
        // minify: true
    }

};

const logError = function(err) {
    var errorMsg = err, //err.message,
        redBoldMsg = chalk.red(errorMsg);
    log(redBoldMsg);
};

let watchBrowserify = browserify(CONFIG.browserify)
    .transform(babelify.configure(CONFIG.babelify))
    .transform(stringify, CONFIG.stringify)
    .transform(hbsfy);

let watchBrowserifyPreProd = browserify(CONFIG.browserifyPreProd)
    .transform(babelify.configure(CONFIG.babelify))
    .transform(stringify, CONFIG.stringify)
    .transform(hbsfy);


/* google docs keys to local archieML */
gulp.task('docs', () => {
    //keys stored in config.json
    //   "docs": ["1JjYD90DyoaBuRYNxa4_nqrHKkgZf1HrUj30i3rTWX1s"]
    trudyConfig.docs.forEach((key) => {
        new GoogleDriveAml2json({
            fileId: key,
            dest: path.join(__dirname, PATHS.hbsData)
        })
    })
});

/* clean */

gulp.task('clean', () => {
    del.sync(['./' + PATHS.dev]);
    del.sync(['./publish']);
});

gulp.task('cleanDev', () => {
    del.sync(['./dev']);
});

gulp.task('cleanPublish', () => {
    del.sync(['./publish']);
});

/* browsersync */

gulp.task('browserSync', () => {
    browserSync.init(CONFIG.browserSync, function(err, bs) {
        opn('http://isp.dev.nationalgeographic.com:' + bs.options.get('port')).catch(error => { console.error(error) });
    });
});

/* parse archie */
gulp.task('archieHbs', () => {
    return gulp.src(PATHS.hbsData + "/*.aml")
        .pipe(archieml())
        .pipe(gdata(function(file) {
            // archieml plugin turns it into a .json
            // save data to a config whose key is the filename without extension
            CONFIG.hbsData[path.basename(file.path, '.json')] = JSON.parse(String(file.contents))
        }));
});

/* parse json */
gulp.task('jsonHbs', () => {
    return gulp.src(PATHS.hbsData + "/*.json")
        .pipe(gdata(function(file) {
            // save data to a config whose key is the filename without extension
            CONFIG.hbsData[path.basename(file.path, '.json')] = JSON.parse(String(file.contents))
        }));
});

/* html */
// inject _graphic.html into all layouts
gulp.task('html', ['jsonHbs'], () => {
    return gulp.src(PATHS.html)
        // take all config files and turn them into usable data for the templates
        .pipe(handlebars(CONFIG.hbsData, CONFIG.hbs))
        .on('error', function(err) {
            logError(err);
            this.emit('end');
        })
        .pipe(gulp.dest(PATHS.dev))
        .pipe(browserSync.reload({ stream: true }));
});


// put prefix on style and script tags ONLY on the graphic html
// TODO: clean white space?
gulp.task('html-prod', () => {
    return gulp.src(PATHS.dev + '/_graphic.html')
        .pipe(prefixer.html({
            prefix: PATHS.publicPrefix,
            tags: ['script', 'link', 'a', 'img', 'embed', 'video'],
            attrs: ['href', 'src', 'data-src', 'source', 'poster']

        }))
        .on('error', function(err) {
            logError(err);
            this.emit('end');
        })
        .pipe(gulp.dest(PATHS.publish));
});


/* assets */

// simply copy assets into dev folder
gulp.task('assets', () => {
    return gulp.src(PATHS.assets)
        .pipe(gulp.dest(PATHS.dev + '/ngm-assets'));
});

gulp.task('assets-prod', () => {
    return gulp.src(PATHS.dev + '/ngm-assets/**/**')
        .pipe(gulp.dest(PATHS.publish + '/ngm-assets'));
});


/* css */


// compile css from sass, autoprefix and write sourcemaps
gulp.task('css', () => {
    return gulp.src(PATHS.src + '/sass/base.scss')
        .pipe(sourcemaps.init())
        .pipe(sass().on('error', sass.logError))
        .pipe(postcss([autoprefixer({ browsers: ['last 2 versions'] })]))
        .on('error', function(err) {
            logError(err);
            this.emit('end');
        })
        .pipe(sourcemaps.write())
        .on('error', logError)
        .pipe(gulp.dest(PATHS.dev + '/css'))
        .pipe(browserSync.reload({ stream: true }));
});

// minify css
gulp.task('css-prod', () => {
    return gulp.src(PATHS.dev + '/css/base.css')
        .pipe(cssmin())
        .on('error', function(err) {
            logError(err);
            this.emit('end');
        })
        .pipe(gulp.dest(PATHS.publish + '/css'))
});


/* js */

// https://www.viget.com/articles/gulp-browserify-starter-faq
// sourcemaps: https://github.com/gulpjs/gulp/blob/master/docs/recipes/browserify-uglify-sourcemap.md
// babelify https://github.com/babel/babelify
gulp.task('js', () => {
    function bundleJs() {
        return watchBrowserify
            .bundle()
            .on('error', function(err) {
                logError(err);
                this.emit('end');
            })
            .pipe(source('base.js'))
            .pipe(buffer())
            .pipe(sourcemaps.init({ loadMaps: true }))
            .on('error', function(err) {
                logError(err);
                this.emit('end');
            })
            .pipe(sourcemaps.write('./'))
            .pipe(gulp.dest(PATHS.dev + '/js'))
            .pipe(browserSync.reload({ stream: true }));
    }

    watchBrowserify.on('log', log);
    watchBrowserify.on('update', bundleJs);

    return bundleJs();
});

gulp.task('js-dev-only', () => {
    return watchBrowserifyPreProd
        .bundle()
        .on('error', function(err) {
            logError(err);
            this.emit('end');
        })
        .pipe(source('base.js'))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
        .on('error', function(err) {
            logError(err);
            this.emit('end');
        })
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest(PATHS.dev + '/js'))
        .pipe(browserSync.reload({ stream: true }));
});

// minify js
gulp.task('js-prod', () => {
    return gulp.src(PATHS.dev + '/js/base.js')
        .pipe(replace({
            patterns: [
                {
                    match: /@@deployRoot/g,
                    replacement: function(a, b, c) {
                        return PATHS.publicPrefix;
                    }
                },
                {
                    match: /(['"])([\/.]*ngm-assets\/[\w\/._\-\\]+)(['"])/g,
                    replacement: function(fullMatch, group1, group2, group3) {
                        if (group2.includes('require(')) {
                            return fullMatch;
                        } else {
                            const p1 = path.join(PATHS.publicPrefix, group2),
                                p2 = p1.split('https:/'),
                                p3 = `https://${p2[1]}`;
                            return group1 + p3 + group3;
                        }
                    }
                }
            ]
        }))
        .pipe(uglify())
        .on('error', function(err) {
            logError(err);
            this.emit('end');
        })
        .pipe(gulp.dest(PATHS.publish + '/js'));
});


/* deployer */

gulp.task('graphicsDeployer', (cb) => {
    return new GraphicsDeployer({
        pathToCopy: PATHS.publish,
        projectName: PATHS.cwd,
        artifactName: PATHS.timePath,
        staging: CONFIG.staging,
        publishUrl: PATHS.publishUrl,
        log: "./config.json"
    }).then(function(msg) {
        // message to console
        log(chalk.magenta('Your prepared HTML lives here: ' + PATHS.publish));
        if (!__dirname.includes('kennedye')) opn(PATHS.publish, { app: 'Finder', wait: false }).catch(error => { console.error(error) });
    })

});

gulp.task('tilesDeployer', (cb) => {
    const argv = yargs.string(["tileset", "appendPathToLatest"] ).argv
    if (argv.tileset) {
        return new GraphicsDeployer({
            pathToCopy: path.join(PATHS.tiles,argv.tileset),
            projectName: path.join(PATHS.cwd,argv.tileset),
            artifactName: PATHS.timePath,
            staging: CONFIG.staging,
            publishUrl: PATHS.tilesUrl,
            publishType: "tileset",
            appendPathToLatest: argv.appendPathToLatest,
            log: "./config.json"
        })      
     }
});


// runs the main task as the files change
gulp.task('watch', () => {
    gulp.watch(PATHS.hbsData + '/*.*', ['html']);
    gulp.watch(PATHS.html, ['html']);
    gulp.watch(PATHS.assets, ['assets']);
    gulp.watch(PATHS.css, ['css']);
    // js is handled by watchify

});



gulp.task('dev', (callback) => {
    runSequence('cleanDev', 'assets', 'css', 'js', 'html', callback);
});
gulp.task('dev-pre-prod', ['html', 'assets', 'css', 'js-dev-only']);
// gulp.task('default', ['browserSync', 'watch', 'dev']);
gulp.task('default', (callback) => {
    runSequence('dev', 'browserSync', 'watch', callback);
});
gulp.task('production', ['html-prod', 'assets-prod', 'css-prod', 'js-prod']);
gulp.task('publish', (callback) => {
    runSequence('cleanDev', 'cleanPublish', 'dev-pre-prod', 'production', 'graphicsDeployer', callback);
});
gulp.task('publish-tiles', (callback) => {
    runSequence('tilesDeployer', callback);
})
