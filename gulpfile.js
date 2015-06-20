var jshint = require('gulp-jshint');
var gulp   = require('gulp');
var stylish = require('jshint-stylish');
var mocha = require('gulp-mocha');
var istanbul = require('gulp-istanbul');

gulp.task('jshint', function() {
    return gulp.src('./lib/*.js')
        .pipe(jshint())
        .pipe(jshint.reporter(stylish));
});

gulp.task('test', function () {
    return gulp.src('test/*.spec.js', {read: false})
        .pipe(mocha());
});

gulp.task('coverage', function (cb) {
    gulp.src(['lib/**/*.js', 'main.js'])
        .pipe(istanbul()) // Covering files
        .pipe(istanbul.hookRequire()) // Force `require` to return covered files
        .on('finish', function () {
            gulp.src(['test/*.spec.js'])
                .pipe(mocha())
                .pipe(istanbul.writeReports()) // Creating the reports after tests ran
                .pipe(istanbul.enforceThresholds({ thresholds: { global: 90 } })) // Enforce a coverage of at least 90%
                .on('end', cb);
        });
});

gulp.task('default',['test']);