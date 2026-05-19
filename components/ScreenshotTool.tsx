'use client';
import React, { useState } from 'react';
import { Camera } from 'lucide-react';

interface ScreenshotToolProps {
  onScreenshotUpload: (files: any[]) => void;
  disabled?: boolean;
}

const ScreenshotTool: React.FC<ScreenshotToolProps> = ({ onScreenshotUpload, disabled = false }) => {
  const [screenshotHistory, setScreenshotHistory] = useState<any[]>([]);

  const handleScreenshot = async () => {
    try {
      // 检查浏览器是否支持截图API
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert('您的浏览器不支持截图功能，请使用Chrome或Edge浏览器');
        return;
      }

      // 唤起屏幕共享
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      // 创建截图编辑界面
      const screenshotContainer = document.createElement('div');
      screenshotContainer.style.position = 'fixed';
      screenshotContainer.style.top = '0';
      screenshotContainer.style.left = '0';
      screenshotContainer.style.width = '100%';
      screenshotContainer.style.height = '100vh';
      screenshotContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      screenshotContainer.style.zIndex = '9999';
      screenshotContainer.style.display = 'flex';
      screenshotContainer.style.flexDirection = 'column';
      document.body.appendChild(screenshotContainer);

      // 创建视频元素来显示流
      const video = document.createElement('video');
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.srcObject = stream;
      screenshotContainer.appendChild(video);

      // 创建Canvas元素用于绘制选择区域和标注
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'auto';
      screenshotContainer.appendChild(canvas);

      // 设置Canvas尺寸
      const updateCanvasSize = () => {
        canvas.width = screenshotContainer.clientWidth;
        canvas.height = screenshotContainer.clientHeight;
      };
      updateCanvasSize();
      window.addEventListener('resize', updateCanvasSize);

      // 获取Canvas上下文
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 选择区域变量
      let isSelecting = false;
      let startX = 0;
      let startY = 0;
      let selection = { x: 0, y: 0, width: 0, height: 0 };

      // 编辑模式
      let editMode = 'select'; // select, draw, text, blur
      let isDrawing = false;
      let lastX = 0;
      let lastY = 0;

      // 绘制选择区域
      const drawSelection = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (selection.width > 0 && selection.height > 0) {
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
          ctx.setLineDash([]);
        }
      };

      // 鼠标事件
      canvas.addEventListener('mousedown', (e) => {
        if (editMode === 'select') {
          isSelecting = true;
          startX = e.clientX;
          startY = e.clientY;
        } else if (editMode === 'draw') {
          isDrawing = true;
          lastX = e.clientX;
          lastY = e.clientY;
          ctx.beginPath();
          ctx.moveTo(lastX, lastY);
        } else if (editMode === 'text') {
          // 创建文本输入框
          const textInput = document.createElement('input');
          textInput.type = 'text';
          textInput.style.position = 'absolute';
          textInput.style.left = e.clientX + 'px';
          textInput.style.top = e.clientY + 'px';
          textInput.style.zIndex = '10000';
          textInput.style.padding = '4px';
          textInput.style.fontSize = '14px';
          textInput.style.border = '1px solid #ccc';
          textInput.style.backgroundColor = 'white';
          textInput.style.color = 'black';
          document.body.appendChild(textInput);
          textInput.focus();

          textInput.addEventListener('blur', () => {
            if (textInput.value) {
              ctx.font = '14px Arial';
              ctx.fillStyle = '#ff0000';
              ctx.fillText(textInput.value, e.clientX, e.clientY + 14);
            }
            document.body.removeChild(textInput);
          });

          textInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              textInput.blur();
            }
          });
        } else if (editMode === 'blur') {
          isSelecting = true;
          startX = e.clientX;
          startY = e.clientY;
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        if (isSelecting) {
          if (editMode === 'select') {
            selection.x = Math.min(startX, e.clientX);
            selection.y = Math.min(startY, e.clientY);
            selection.width = Math.abs(e.clientX - startX);
            selection.height = Math.abs(e.clientY - startY);
            drawSelection();
          } else if (editMode === 'blur') {
            // 实时绘制模糊效果
            const tempX = Math.min(startX, e.clientX);
            const tempY = Math.min(startY, e.clientY);
            const tempWidth = Math.abs(e.clientX - startX);
            const tempHeight = Math.abs(e.clientY - startY);
            
            // 重新绘制背景
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (selection.width > 0 && selection.height > 0) {
              ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
              ctx.fillRect(selection.x, selection.y, selection.width, selection.height);
            }
            
            // 绘制当前模糊区域
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(tempX, tempY, tempWidth, tempHeight);
          }
        } else if (isDrawing && editMode === 'draw') {
          ctx.lineTo(e.clientX, e.clientY);
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 2;
          ctx.stroke();
          lastX = e.clientX;
          lastY = e.clientY;
        }
      });

      canvas.addEventListener('mouseup', () => {
        if (isSelecting && editMode === 'blur') {
          // 确认模糊区域
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(selection.x, selection.y, selection.width, selection.height);
        }
        isSelecting = false;
        isDrawing = false;
      });

      // 创建控制栏
      const controlBar = document.createElement('div');
      controlBar.style.position = 'absolute';
      controlBar.style.bottom = '0';
      controlBar.style.left = '0';
      controlBar.style.width = '100%';
      controlBar.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      controlBar.style.color = 'white';
      controlBar.style.padding = '10px';
      controlBar.style.display = 'flex';
      controlBar.style.justifyContent = 'space-between';
      controlBar.style.alignItems = 'center';
      screenshotContainer.appendChild(controlBar);

      // 创建编辑工具
      const editTools = document.createElement('div');
      editTools.style.display = 'flex';
      editTools.style.gap = '10px';
      
      const selectTool = document.createElement('button');
      selectTool.textContent = '选择';
      selectTool.style.padding = '4px 8px';
      selectTool.style.backgroundColor = '#28a745';
      selectTool.style.color = 'white';
      selectTool.style.border = 'none';
      selectTool.style.borderRadius = '4px';
      selectTool.style.cursor = 'pointer';
      selectTool.addEventListener('click', () => {
        editMode = 'select';
        selectTool.style.backgroundColor = '#28a745';
        drawTool.style.backgroundColor = '#6c757d';
        textTool.style.backgroundColor = '#6c757d';
        blurTool.style.backgroundColor = '#6c757d';
      });

      const drawTool = document.createElement('button');
      drawTool.textContent = '标注';
      drawTool.style.padding = '4px 8px';
      drawTool.style.backgroundColor = '#6c757d';
      drawTool.style.color = 'white';
      drawTool.style.border = 'none';
      drawTool.style.borderRadius = '4px';
      drawTool.style.cursor = 'pointer';
      drawTool.addEventListener('click', () => {
        editMode = 'draw';
        selectTool.style.backgroundColor = '#6c757d';
        drawTool.style.backgroundColor = '#28a745';
        textTool.style.backgroundColor = '#6c757d';
        blurTool.style.backgroundColor = '#6c757d';
      });

      const textTool = document.createElement('button');
      textTool.textContent = '文字';
      textTool.style.padding = '4px 8px';
      textTool.style.backgroundColor = '#6c757d';
      textTool.style.color = 'white';
      textTool.style.border = 'none';
      textTool.style.borderRadius = '4px';
      textTool.style.cursor = 'pointer';
      textTool.addEventListener('click', () => {
        editMode = 'text';
        selectTool.style.backgroundColor = '#6c757d';
        drawTool.style.backgroundColor = '#6c757d';
        textTool.style.backgroundColor = '#28a745';
        blurTool.style.backgroundColor = '#6c757d';
      });

      const blurTool = document.createElement('button');
      blurTool.textContent = '打码';
      blurTool.style.padding = '4px 8px';
      blurTool.style.backgroundColor = '#6c757d';
      blurTool.style.color = 'white';
      blurTool.style.border = 'none';
      blurTool.style.borderRadius = '4px';
      blurTool.style.cursor = 'pointer';
      blurTool.addEventListener('click', () => {
        editMode = 'blur';
        selectTool.style.backgroundColor = '#6c757d';
        drawTool.style.backgroundColor = '#6c757d';
        textTool.style.backgroundColor = '#6c757d';
        blurTool.style.backgroundColor = '#28a745';
      });

      editTools.appendChild(selectTool);
      editTools.appendChild(drawTool);
      editTools.appendChild(textTool);
      editTools.appendChild(blurTool);

      // 创建操作按钮
      const cancelButton = document.createElement('button');
      cancelButton.textContent = '取消';
      cancelButton.style.padding = '8px 16px';
      cancelButton.style.backgroundColor = '#6c757d';
      cancelButton.style.color = 'white';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '4px';
      cancelButton.style.cursor = 'pointer';

      const captureButton = document.createElement('button');
      captureButton.textContent = '捕获';
      captureButton.style.padding = '8px 16px';
      captureButton.style.backgroundColor = '#28a745';
      captureButton.style.color = 'white';
      captureButton.style.border = 'none';
      captureButton.style.borderRadius = '4px';
      captureButton.style.cursor = 'pointer';

      controlBar.appendChild(editTools);
      controlBar.appendChild(cancelButton);
      controlBar.appendChild(captureButton);

      // 取消按钮事件
      cancelButton.addEventListener('click', () => {
        stream.getTracks().forEach(track => track.stop());
        window.removeEventListener('resize', updateCanvasSize);
        document.body.removeChild(screenshotContainer);
      });

      // 捕获按钮事件
      captureButton.addEventListener('click', async () => {
        // 创建Canvas元素来绘制截图
        const captureCanvas = document.createElement('canvas');
        
        // 如果有选择区域，只捕获选择区域
        if (selection.width > 0 && selection.height > 0) {
          captureCanvas.width = selection.width;
          captureCanvas.height = selection.height;
        } else {
          // 使用视频元素的实际尺寸或默认尺寸
          const videoWidth = video.videoWidth || window.innerWidth;
          const videoHeight = video.videoHeight || window.innerHeight;
          captureCanvas.width = videoWidth;
          captureCanvas.height = videoHeight;
        }
        
        const captureCtx = captureCanvas.getContext('2d');

        if (captureCtx) {
          if (selection.width > 0 && selection.height > 0) {
            // 计算视频元素在容器中的位置和尺寸
            const videoRect = video.getBoundingClientRect();
            const originalVideoWidth = video.videoWidth || videoRect.width;
            const originalVideoHeight = video.videoHeight || videoRect.height;
            const scaleX = originalVideoWidth / videoRect.width;
            const scaleY = originalVideoHeight / videoRect.height;
            
            // 计算选择区域在视频中的位置
            const videoX = (selection.x - videoRect.left) * scaleX;
            const videoY = (selection.y - videoRect.top) * scaleY;
            const selectedVideoWidth = selection.width * scaleX;
            const selectedVideoHeight = selection.height * scaleY;
            
            // 绘制选择区域到Canvas
            captureCtx.drawImage(
              video, 
              videoX, 
              videoY, 
              selectedVideoWidth, 
              selectedVideoHeight, 
              0, 
              0, 
              captureCanvas.width, 
              captureCanvas.height
            );

            // 绘制标注
            const canvasScaleX = selection.width / canvas.width;
            const canvasScaleY = selection.height / canvas.height;
            captureCtx.drawImage(
              canvas, 
              selection.x, 
              selection.y, 
              selection.width, 
              selection.height, 
              0, 
              0, 
              captureCanvas.width, 
              captureCanvas.height
            );
          } else {
            // 绘制整个视频帧到Canvas
            const videoWidth = video.videoWidth || captureCanvas.width;
            const videoHeight = video.videoHeight || captureCanvas.height;
            captureCtx.drawImage(video, 0, 0, videoWidth, videoHeight, 0, 0, captureCanvas.width, captureCanvas.height);
            // 绘制标注
            captureCtx.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);
          }

          // 停止流
          stream.getTracks().forEach(track => track.stop());

          // 移除截图界面
          window.removeEventListener('resize', updateCanvasSize);
          document.body.removeChild(screenshotContainer);

          // 将Canvas转换为Blob
          captureCanvas.toBlob(async (blob) => {
            if (blob) {
              // 创建本地预览界面
              const previewContainer = document.createElement('div');
              previewContainer.style.position = 'fixed';
              previewContainer.style.top = '0';
              previewContainer.style.left = '0';
              previewContainer.style.width = '100%';
              previewContainer.style.height = '100vh';
              previewContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
              previewContainer.style.zIndex = '9999';
              previewContainer.style.display = 'flex';
              previewContainer.style.flexDirection = 'column';
              previewContainer.style.alignItems = 'center';
              previewContainer.style.justifyContent = 'center';
              document.body.appendChild(previewContainer);

              // 创建预览图像
              const img = document.createElement('img');
              img.src = URL.createObjectURL(blob);
              img.style.maxWidth = '80%';
              img.style.maxHeight = '70%';
              img.style.objectFit = 'contain';
              previewContainer.appendChild(img);

              // 创建预览控制栏
              const previewControlBar = document.createElement('div');
              previewControlBar.style.marginTop = '20px';
              previewControlBar.style.display = 'flex';
              previewControlBar.style.gap = '10px';
              previewContainer.appendChild(previewControlBar);

              // 创建重新截图按钮
              const retryButton = document.createElement('button');
              retryButton.textContent = '重新截图';
              retryButton.style.padding = '8px 16px';
              retryButton.style.backgroundColor = '#6c757d';
              retryButton.style.color = 'white';
              retryButton.style.border = 'none';
              retryButton.style.borderRadius = '4px';
              retryButton.style.cursor = 'pointer';
              retryButton.addEventListener('click', () => {
                document.body.removeChild(previewContainer);
                URL.revokeObjectURL(img.src);
                handleScreenshot();
              });

              // 创建确认按钮
              const confirmButton = document.createElement('button');
              confirmButton.textContent = '完成';
              confirmButton.style.padding = '8px 16px';
              confirmButton.style.backgroundColor = '#28a745';
              confirmButton.style.color = 'white';
              confirmButton.style.border = 'none';
              confirmButton.style.borderRadius = '4px';
              confirmButton.style.cursor = 'pointer';
              confirmButton.addEventListener('click', async () => {
                // 上传文件
                const formData = new FormData();
                const file = new File([blob], 'screenshot.png', { type: 'image/png' });
                formData.append('files', file);
                
                try {
                  const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                  });
                  
                  if (response.ok) {
                    const data = await response.json();
                    const newFiles = data.files.map((file: any) => ({
                      name: file.name,
                      size: file.size,
                      type: file.type,
                      filename: file.filename,
                      url: file.url
                    }));
                    
                    // 调用回调函数
                    onScreenshotUpload(newFiles);
                    
                    // 添加到历史记录
                    setScreenshotHistory(prev => [...prev, ...newFiles]);
                    alert('截图上传成功，已添加到输入框');
                  } else {
                    throw new Error('上传失败');
                  }
                } catch (error) {
                  console.error('上传失败:', error);
                  alert('上传失败，请重试');
                } finally {
                  document.body.removeChild(previewContainer);
                  URL.revokeObjectURL(img.src);
                }
              });

              previewControlBar.appendChild(retryButton);
              previewControlBar.appendChild(confirmButton);
            } else {
              // 处理blob为null的情况
              alert('截图生成失败，请重试');
            }
          }, 'image/png');
        } else {
          // 处理获取canvas上下文失败的情况
          stream.getTracks().forEach(track => track.stop());
          window.removeEventListener('resize', updateCanvasSize);
          document.body.removeChild(screenshotContainer);
          alert('截图生成失败，请重试');
        }
      });

      // 播放视频
      video.play();
    } catch (error) {
      console.error('截图失败:', error);
      alert('截图失败，请重试');
    }
  };

  return (
    <button 
      className="p-1.5 md:p-2 hover:bg-gray-200 rounded-md" 
      disabled={disabled}
      onClick={handleScreenshot}
    >
      <Camera size={20} className="text-gray-600" />
    </button>
  );
};

export default ScreenshotTool;
