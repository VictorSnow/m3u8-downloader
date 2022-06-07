// ==UserScript==
// @name         m3u8-downloader
// @namespace    https://github.com/Momo707577045/m3u8-downloader
// @version      0.5.0
// @description  https://github.com/Momo707577045/m3u8-downloader 配套插件
// @author       Momo707577045
// @include      *
// @exclude      http://blog.luckly-mjw.cn/tool-show/m3u8-downloader/index.html
// @grant        none
// @run-at document-start
// ==/UserScript==

import parseQueryParameters from 'parse-url-query-params';
import { createApp } from "vue";
import AESDecryptor from "hls.js/src/crypt/aes-decryptor";
import {hook} from "ajax-hook";

(function () {
    var m3u8Target = ''
    var originXHR = window.XMLHttpRequest

    function initUI() {
        let app = createApp({
            data() {
                return {
                    url: '', // 在线链接
                    tips: 'm3u8 视频在线提取工具', // 顶部提示
                    isPause: false, // 是否暂停下载
                    isGetMP4: false, // 是否转码为 MP4 下载
                    durationSecond: 0, // 视频持续时长
                    isShowRefer: true, // 是否显示推送
                    downloading: false, // 是否下载中
                    beginTime: '', // 开始下载的时间
                    errorNum: 0, // 错误数
                    finishNum: 0, // 已下载数
                    downloadIndex: 0, // 当前下载片段
                    finishList: [], // 下载完成项目
                    tsUrlList: [], // ts URL数组
                    mediaFileList: [], // 下载的媒体数组
                    minDlThread: 3, // 最少的下载线程
                    dlThread: 0, // 当前的下载线程
                    rangeDownload: { // 特定范围下载
                        isShowRange: false, // 是否显示范围下载
                        startSegment: '', // 起始片段
                        endSegment: '', // 截止片段
                        targetSegment: 1, // 待下载片段
                    },
                    aesConf: { // AES 视频解密配置
                        method: '', // 加密算法
                        uri: '', // key 所在文件路径
                        iv: '', // 偏移值
                        key: '', // 秘钥
                        decryptor: null, // 解码器对象

                        stringToBuffer: function (str) {
                            return new TextEncoder().encode(str)
                        },
                    },
                }
            },
            template: `<div>
        <div style="
          margin-top: 6px;
          padding: 6px 10px ;
          font-size: 18px;
          color: white;
          cursor: pointer;
          border-radius: 4px;
          border: 1px solid #eeeeee;
          background-color: #3D8AC7;
          position:fixed;
          top: 20px;
          right: 20px;
          max-width: 200px;
          overflow: hidden;
          z-index: 9999;
        " @click="downloadKK()">
            <p v-if="finishNum === rangeDownload.targetSegment && rangeDownload.targetSegment > 0" class="disable">下载完成</p>
            <p v-show="false">
                <input type="text" v-model="url" :disabled="downloading" placeholder="请输入 m3u8 链接" style="max-width: 140px;">
            </p>
            <p>进度:{{finishNum}}-<b style="color:red">{{errorNum}}</b>/{{rangeDownload.targetSegment}}</p>
        </div>
      </div>`,
            methods: {
                // ajax 请求
                ajax(options) {
                    options = options || {};
                    let xhr = new XMLHttpRequest();
                    if (options.type === 'file') {
                        xhr.responseType = 'arraybuffer';
                    }

                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4) {
                            let status = xhr.status;
                            if (status >= 200 && status < 300) {
                                options.success && options.success(xhr.response);
                            } else {
                                options.fail && options.fail(status);
                            }
                        }
                    };

                    xhr.open("GET", options.url, true);
                    xhr.send(null);
                },

                // 合成URL
                applyURL(targetURL, baseURL) {
                    baseURL = baseURL || location.href
                    if (targetURL.indexOf('http') === 0) {
                        return targetURL
                    } else if (targetURL[0] === '/') {
                        let domain = baseURL.split('/')
                        return domain[0] + '//' + domain[2] + targetURL
                    } else {
                        let domain = baseURL.split('/')
                        domain.pop()
                        return domain.join('/') + '/' + targetURL
                    }
                },

                downloadKK() {
                    if (this.errorNum) {
                        this.retryAll()
                    } else if (!this.downloading) {
                        this.getM3U8();
                    }
                },
                // 获取在线文件
                getM3U8() {
                    if (!this.url) {
                        alert('请输入链接')
                        return
                    }
                    if (this.url.toLowerCase().indexOf('.m3u8') === -1 &&
                        this.url.toLowerCase().indexOf('m3u8.php') === -1) {
                        alert('链接有误，请重新输入')
                        return
                    }
                    if (this.downloading) {
                        alert('资源下载中，请稍后')
                        return
                    }

                    this.tips = 'm3u8 文件下载中，请稍后'
                    this.beginTime = new Date()
                    this.ajax({
                        url: this.url,
                        success: (m3u8Str) => {
                            this.tsUrlList = []
                            this.finishList = []

                            // 提取 ts 视频片段地址
                            m3u8Str.split('\n').forEach((item) => {
                                if (item.toLowerCase().indexOf('.ts') > -1 || item.toLowerCase().indexOf('.image') > -1) {
                                    this.tsUrlList.push(this.applyURL(item, this.url))
                                    this.finishList.push({
                                        title: item,
                                        status: ''
                                    })
                                }
                            })

                            // 仅获取视频片段数
                            //if (onlyGetRange) {
                            //    this.rangeDownload.isShowRange = true
                            //    this.rangeDownload.endSegment = this.tsUrlList.length
                            //    this.rangeDownload.targetSegment = this.tsUrlList.length
                            //    return
                            //} else {
                            let startSegment = Math.max(this.rangeDownload.startSegment || 1, 1) // 最小为 1
                            let endSegment = Math.max(this.rangeDownload.endSegment || this.tsUrlList.length, 1)
                            startSegment = Math.min(startSegment, this.tsUrlList.length) // 最大为 this.tsUrlList.length
                            endSegment = Math.min(endSegment, this.tsUrlList.length)
                            this.rangeDownload.startSegment = Math.min(startSegment, endSegment)
                            this.rangeDownload.endSegment = Math.max(startSegment, endSegment)
                            this.rangeDownload.targetSegment = this.rangeDownload.endSegment - this.rangeDownload.startSegment + 1
                            this.downloadIndex = this.rangeDownload.startSegment - 1
                            this.downloading = true
                            //}

                            // 获取需要下载的 MP4 视频长度
                            //if (this.isGetMP4) {
                            //    let infoIndex = 0
                            //    m3u8Str.split('\n').forEach(item => {
                            //        if (item.toUpperCase().indexOf('#EXTINF:') > -1) { // 计算视频总时长，设置 mp4 信息时使用
                            //            infoIndex++
                            //            if (this.rangeDownload.startSegment <= infoIndex && infoIndex <= this.rangeDownload.endSegment) {
                            //                this.durationSecond += parseFloat(item.split('#EXTINF:')[1])
                            //            }
                            //        }
                            //    })
                            //}

                            // 检测视频 AES 加密
                            if (m3u8Str.indexOf('#EXT-X-KEY') > -1) {
                                this.aesConf.method = (m3u8Str.match(/(.*METHOD=([^,\s]+))/) || ['', '', ''])[2]
                                this.aesConf.uri = (m3u8Str.match(/(.*URI="([^"]+))"/) || ['', '', ''])[2]
                                this.aesConf.iv = (m3u8Str.match(/(.*IV=([^,\s]+))/) || ['', '', ''])[2]
                                this.aesConf.iv = this.aesConf.iv ? this.aesConf.stringToBuffer(this.aesConf.iv) : ''
                                this.aesConf.uri = this.applyURL(this.aesConf.uri, this.url)

                                // let params = m3u8Str.match(/#EXT-X-KEY:([^,]*,?METHOD=([^,]+))?([^,]*,?URI="([^,]+)")?([^,]*,?IV=([^,^\\n]+))?/)
                                // this.aesConf.method = params[2]
                                // this.aesConf.uri = this.applyURL(params[4], this.url)
                                // this.aesConf.iv = params[6] ? this.aesConf.stringToBuffer(params[6]) : ''
                                this.getAES();
                            } else if (this.tsUrlList.length > 0) { // 如果视频没加密，则直接下载片段，否则先下载秘钥
                                this.downloadTS()
                            } else {
                                this.alertError('资源为空，请查看链接是否有效')
                            }
                        },
                        fail: () => {
                            this.alertError('链接不正确，请查看链接是否有效')
                        }
                    })
                },

                // 获取AES配置
                getAES() {
                    //alert('视频被 AES 加密，点击确认，进行视频解码')
                    this.ajax({
                        type: 'file',
                        url: this.aesConf.uri,
                        success: (key) => {
                            // console.log('getAES', key)
                            // this.aesConf.key = this.aesConf.stringToBuffer(key)
                            this.aesConf.key = key
                            this.aesConf.decryptor = new AESDecryptor()
                            this.aesConf.decryptor.constructor()
                            this.aesConf.decryptor.expandKey(this.aesConf.key);
                            this.downloadTS()
                        },
                        fail: () => {
                            this.alertError('视频已进行定制化加密，不提供定制化解密下载')
                        }
                    })
                },

                // ts 片段的 AES 解码
                aesDecrypt(data, index) {
                    let iv = this.aesConf.iv || new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, index])
                    return this.aesConf.decryptor.decrypt(data, 0, iv.buffer || iv, true)
                },

                // 下载分片
                downloadTS() {
                    this.tips = 'ts 视频碎片下载中，请稍后'
                    let download = () => {
                        let isPause = this.isPause // 使用另一个变量来保持下载前的暂停状态，避免回调后没修改
                        let index = this.downloadIndex
                        this.downloadIndex++
                        this.dlThread++;
                        if (this.finishList[index] && this.finishList[index].status === '') {
                            this.ajax({
                                url: this.tsUrlList[index],
                                type: 'file',
                                success: (file) => {
                                    this.dlThread--;
                                    this.dealTS(file, index, () => this.downloadIndex < this.rangeDownload.endSegment && !isPause && download())
                                },
                                fail: () => {
                                    this.errorNum++;
                                    this.dlThread--;
                                    this.finishList[index].status = 'error'
                                    if (this.downloadIndex < this.rangeDownload.endSegment) {
                                        !isPause && download()
                                    }
                                }
                            })
                        } else if (this.downloadIndex < this.rangeDownload.endSegment) { // 跳过已经成功的片段
                            !isPause && download()
                        }
                    }

                    // 建立多少个 ajax 线程
                    for (let i = this.dlThread; i < Math.min(this.minDlThread, this.rangeDownload.targetSegment - this.finishNum); i++) {
                        download(i)
                    }
                },

                // 处理 ts 片段，AES 解密、mp4 转码
                dealTS(file, index, callback) {
                    const data = this.aesConf.uri ? this.aesDecrypt(file, index) : file
                    //this.conversionMp4(data, index, (afterData) => { // mp4 转码
                    this.mediaFileList[index - this.rangeDownload.startSegment + 1] = data // 判断文件是否需要解密
                    // 有可能下载同一段文件
                    if (this.finishList[index].status != 'finish') {
                        this.finishList[index].status = 'finish'
                        this.finishNum++
                    }
                    if (this.finishNum === this.rangeDownload.targetSegment) {
                        this.downloadFile(this.mediaFileList, this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss'))
                    }
                    callback && callback()
                    //})
                },

                // 暂停与恢复
                togglePause() {
                    this.isPause = !this.isPause
                    !this.isPause && this.retryAll()
                },

                // 重新下载所有错误片段
                retryAll() {
                    this.finishList.forEach((item) => { // 重置所有片段状态
                        if (item.status === 'error') {
                            item.status = ''
                        }
                    })
                    this.errorNum = 0
                    this.downloadIndex = this.rangeDownload.startSegment - 1
                    this.downloadTS()
                },

                // 下载整合后的TS文件
                downloadFile(fileDataList, fileName) {
                    this.tips = 'ts 碎片整合中，请留意浏览器下载'
                    let fileBlob = null
                    let a = document.createElement('a')

                    // 使用可能的文件名
                    if (this.getFilename()) {
                        fileName = this.getFilename();
                    }

                    //if (this.isGetMP4) {
                    //    fileBlob = new Blob(fileDataList, {type: 'video/mp4'}) // 创建一个Blob对象，并设置文件的 MIME 类型
                    //    a.download = fileName + '.mp4'
                    //} else {
                    fileBlob = new Blob(fileDataList, {type: 'video/mp4'}) // 创建一个Blob对象，并设置文件的 MIME 类型
                    a.download = fileName + '.mp4'
                    //}
                    a.href = URL.createObjectURL(fileBlob)
                    a.style.display = 'none'
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                },
                getFilename() {
                    // 使用可能的文件名
                    if (location.search) {
                        let prsedUrl = parseQueryParameters(location.href);
                        if (prsedUrl.viewkey) {
                            return prsedUrl.viewkey;
                        }
                    }

                    if ($ && $('h1').text() != '') {
                        return $('h1').text();
                    }

                    return document.title || '';
                },
                // 格式化时间
                formatTime(date, formatStr) {
                    const formatType = {
                        Y: date.getFullYear(),
                        M: date.getMonth() + 1,
                        D: date.getDate(),
                        h: date.getHours(),
                        m: date.getMinutes(),
                        s: date.getSeconds(),
                    }
                    return formatStr.replace(
                        /Y+|M+|D+|h+|m+|s+/g,
                        target => (new Array(target.length).join('0') + formatType[target[0]]).substr(-target.length)
                    )
                },

                // 强制下载现有片段
                forceDownload() {
                    if (this.mediaFileList.length) {
                        this.downloadFile(this.mediaFileList, this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss'))
                    } else {
                        alert('当前无已下载片段')
                    }
                },

                // 发生错误，进行提示
                alertError(tips) {
                    alert(tips)
                    this.downloading = false
                    this.tips = 'm3u8 视频在线提取工具';
                },
            }
        });

        let vm = app.mount('#___m3u8-downloader');
        return vm;
    }

    function ajax(options) {
        options = options || {};
        let xhr = new originXHR();
        if (options.type === 'file') {
            xhr.responseType = 'arraybuffer';
        }

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                let status = xhr.status;
                if (status >= 200 && status < 300) {
                    options.success && options.success(xhr.response);
                } else {
                    options.fail && options.fail(status);
                }
            }
        };

        xhr.open("GET", options.url, true);
        xhr.send(null);
    }

    // 检测 m3u8 链接的有效性
    function checkM3u8Url(url) {
        console.log("check m3u8", url);
        ajax({
            url,
            success: (fileStr) => {
                if (fileStr.indexOf('.ts') > -1) {
                    appendDom()
                    m3u8Target = url
                }
            },
            error: (err) => {
                console.log("m3u8 加载失败", err);
            }
        })
    }

    function resetAjax() {
        if (window._hadResetAjax) { // 如果已经重置过，则不再进入。解决开发时局部刷新导致重新加载问题
            return
        }
        window._hadResetAjax = true

        hook({
            open: (args, xhr) => {
                var url = args[1];
                // 设置好timeout 120s
                if (xhr && xhr.timeout == 0) {
                    xhr.timeout = 120 * 1000;
                }

                //url && url.indexOf('.m3u8') > 0 &&
                //console.log("ajax url", url)
                if (url && url.indexOf('.m3u8') > 0) {
                    //checkM3u8Url(url);
                    console.log('Possible m3u8 url:', url);
                }
            },
            onreadystatechange: function(xhr, event) {
                if (xhr.readyState === 4) {
                    let status = xhr.status;
                    if (status >= 200 && status < 300) {
                        // 查看内容是否是 m3u8
                        let url = xhr.responseURL;

                        if (xhr.responseType == '' || xhr.responseType == 'text') {
                            let text = xhr.responseText;
                            if (text && text.toUpperCase().indexOf('#EXTINF') > -1) {
                                console.log('Checking m3u8 Video Url:', url);
                                checkM3u8Url(url);
                            }
                        }
                    }
                }
            }
        })
    }

    function appendDom() {
        if (document.getElementById('m3u8-download-dom')) {
            return
        }
        var domStr = `
  <div style="
    margin-top: 6px;
    padding: 6px 10px ;
    font-size: 18px;
    color: white;
    cursor: pointer;
    border-radius: 4px;
    border: 1px solid #eeeeee;
    background-color: #3D8AC7;
  " id="m3u8-append">注入下载</div>
    `
        var $section = document.createElement('section')
        $section.id = 'm3u8-download-dom'
        $section.style.position = 'fixed'
        $section.style.zIndex = '9999'
        $section.style.top = '20px'
        $section.style.right = '20px'
        $section.style.textAlign = 'center'
        $section.innerHTML = domStr
        document.body.appendChild($section);

        var m3u8Append = document.getElementById('m3u8-append')

        m3u8Append.addEventListener('click', function () {
            m3u8Append.style.display = 'none';

            let elem = document.createElement('div')
            elem.id = "___m3u8-downloader";
            document.body.appendChild(elem);

            let vm = initUI();
            window.vm = vm;
            if (m3u8Target) {
                console.log("set url", m3u8Target, vm.getFilename());
                vm.url = m3u8Target;
                vm.downloadKK();
            }
        })
    }

    window.forceDownload = function (m3u8) {
        m3u8Target = m3u8;
        appendDom();
    }

    resetAjax()
})();