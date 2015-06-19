var jshint = require('gulp-jshint');
var gulp   = require('gulp');
var stylish = require('jshint-stylish');
var mocha = require('gulp-mocha');

gulp.task('jshint', function() {
    return gulp.src('./lib/*.js')
        .pipe(jshint())
        .pipe(jshint.reporter(stylish));
});

gulp.task('test', function () {
    return gulp.src('test/*.spec.js', {read: false})
        .pipe(mocha());
});

gulp.task('default',['test']);